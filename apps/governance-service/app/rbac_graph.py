"""RBAC graph resolver — computes effective privileges with explanation trees.

Works on raw snapshot data (list-of-dict format from ClickHouse system tables).
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any


class RBACGraph:
    """In-memory graph built from a single RBAC snapshot."""

    def __init__(self, raw: dict[str, list[dict]]):
        self._users: dict[str, dict] = {
            u["name"]: u for u in raw.get("users", [])
        }
        self._roles: dict[str, dict] = {
            r["name"]: r for r in raw.get("roles", [])
        }

        # user → [granted_role_name, …]
        self._user_roles: dict[str, list[dict]] = defaultdict(list)
        # role → [inherited_role_name, …]
        self._role_parents: dict[str, list[dict]] = defaultdict(list)

        for rg in raw.get("role_grants", []):
            entry = {
                "granted_role_name": rg.get("granted_role_name", ""),
                "is_default": bool(rg.get("granted_role_is_default", 0)),
                "with_admin_option": bool(rg.get("with_admin_option", 0)),
            }
            if rg.get("user_name"):
                self._user_roles[rg["user_name"]].append(entry)
            elif rg.get("role_name"):
                self._role_parents[rg["role_name"]].append(entry)

        # user → [privilege_dict, …]
        self._user_grants: dict[str, list[dict]] = defaultdict(list)
        # role → [privilege_dict, …]
        self._role_grants_map: dict[str, list[dict]] = defaultdict(list)

        for g in raw.get("grants", []):
            priv = {
                "access_type": g.get("access_type", ""),
                "database": g.get("database") or None,
                "table": g.get("table") or None,
                "column": g.get("column") or None,
                "is_partial_revoke": bool(g.get("is_partial_revoke", 0)),
                "grant_option": bool(g.get("grant_option", 0)),
            }
            if g.get("user_name"):
                self._user_grants[g["user_name"]].append(priv)
            elif g.get("role_name"):
                self._role_grants_map[g["role_name"]].append(priv)

        self._settings_profiles = raw.get("settings_profiles", [])
        self._settings_elements = raw.get("settings_elements", [])
        self._quotas = raw.get("quotas", [])

    # ── public helpers ───────────────────────────────────

    @property
    def user_names(self) -> list[str]:
        return list(self._users.keys())

    @property
    def role_names(self) -> list[str]:
        return list(self._roles.keys())

    def user_info(self, name: str) -> dict | None:
        return self._users.get(name)

    def role_info(self, name: str) -> dict | None:
        return self._roles.get(name)

    # ── role resolution ──────────────────────────────────

    def resolve_user_roles(self, user_name: str) -> list[dict]:
        """All roles (direct + inherited) for a user with derivation path."""
        result: list[dict] = []
        visited: set[str] = set()

        def _walk(role_name: str, path: list[str], is_direct: bool, is_default: bool):
            if role_name in visited:
                return
            visited.add(role_name)
            result.append({
                "role_name": role_name,
                "is_direct": is_direct,
                "is_default": is_default,
                "path": list(path),
            })
            for parent in self._role_parents.get(role_name, []):
                _walk(
                    parent["granted_role_name"],
                    path + [parent["granted_role_name"]],
                    is_direct=False,
                    is_default=False,
                )

        for entry in self._user_roles.get(user_name, []):
            _walk(
                entry["granted_role_name"],
                [user_name, entry["granted_role_name"]],
                is_direct=True,
                is_default=entry.get("is_default", False),
            )

        return result

    def resolve_role_parents(self, role_name: str) -> list[dict]:
        """Roles inherited by *role_name* (recursive)."""
        result: list[dict] = []
        visited: set[str] = set()

        def _walk(rn: str, path: list[str]):
            if rn in visited:
                return
            visited.add(rn)
            result.append({"role_name": rn, "path": list(path)})
            for parent in self._role_parents.get(rn, []):
                _walk(parent["granted_role_name"], path + [parent["granted_role_name"]])

        for parent in self._role_parents.get(role_name, []):
            _walk(parent["granted_role_name"], [role_name, parent["granted_role_name"]])

        return result

    # ── effective privileges ─────────────────────────────

    def resolve_effective_privileges(self, user_name: str) -> list[dict]:
        """Compute effective privileges for a user with explanation."""
        all_roles = self.resolve_user_roles(user_name)
        role_lookup = {r["role_name"]: r for r in all_roles}

        privs: list[dict] = []

        # Direct user grants
        for p in self._user_grants.get(user_name, []):
            privs.append({
                **p,
                "source": "direct",
                "source_name": user_name,
                "path": [user_name],
            })

        # Grants via roles
        for role_info in all_roles:
            rn = role_info["role_name"]
            for p in self._role_grants_map.get(rn, []):
                privs.append({
                    **p,
                    "source": "role",
                    "source_name": rn,
                    "path": role_info["path"],
                })

        # Separate revokes and positive grants
        revokes = [p for p in privs if p.get("is_partial_revoke")]
        grants = [p for p in privs if not p.get("is_partial_revoke")]

        effective: list[dict] = []
        for g in grants:
            revoked = any(
                r["access_type"] == g["access_type"]
                and _scope_covers(r, g)
                for r in revokes
            )
            if not revoked:
                effective.append(g)

        return effective

    def resolve_role_grants(self, role_name: str) -> list[dict]:
        """Direct grants on a specific role."""
        return [
            {**p, "source": "direct", "source_name": role_name}
            for p in self._role_grants_map.get(role_name, [])
        ]

    def role_members(self, role_name: str) -> list[dict]:
        """Who has this role? Returns list of {name, type}."""
        members: list[dict] = []
        for uname, role_list in self._user_roles.items():
            if any(e["granted_role_name"] == role_name for e in role_list):
                members.append({"name": uname, "type": "user"})
        for rname, parent_list in self._role_parents.items():
            if any(e["granted_role_name"] == role_name for e in parent_list):
                members.append({"name": rname, "type": "role"})
        return members

    # ── object access map ────────────────────────────────

    def object_access(self, database: str, table: str | None = None) -> list[dict]:
        """All users/roles with access to *database*[.*table*]."""
        entries: list[dict] = []

        for uname in self._users:
            privs = self.resolve_effective_privileges(uname)
            matching = [
                p for p in privs
                if _priv_matches_object(p, database, table)
            ]
            if matching:
                entries.append({
                    "name": uname,
                    "entity_type": "user",
                    "access_types": sorted({p["access_type"] for p in matching}),
                    "source": ", ".join(
                        sorted({p["source_name"] for p in matching})
                    ),
                })

        return entries

    # ── settings helpers ─────────────────────────────────

    def user_settings_profiles(self, user_name: str) -> list[dict]:
        """Settings profiles that apply to a user."""
        result: list[dict] = []
        for sp in self._settings_profiles:
            applies = sp.get("apply_to_all", 0)
            if applies:
                result.append(sp)
                continue
            apply_list = sp.get("apply_to_list", [])
            if isinstance(apply_list, list) and user_name in apply_list:
                result.append(sp)
        return result


# ── helpers ──────────────────────────────────────────────


def _scope_covers(revoke: dict, grant: dict) -> bool:
    """Does *revoke* cover (i.e. negate) *grant*?"""
    if revoke.get("database") and revoke["database"] != grant.get("database"):
        return False
    if revoke.get("table") and revoke["table"] != grant.get("table"):
        return False
    if revoke.get("column") and revoke["column"] != grant.get("column"):
        return False
    return True


def _priv_matches_object(priv: dict, database: str, table: str | None) -> bool:
    """Does privilege apply to *database*[.*table*]?"""
    p_db = priv.get("database")
    p_tbl = priv.get("table")
    # Global grant (no db restriction) matches everything
    if not p_db:
        return True
    if p_db != database:
        return False
    # Database-level grant (no table restriction) matches all tables in db
    if not p_tbl:
        return True
    if table and p_tbl != table:
        return False
    return True
