"""SQL preview generation for proposals (mirrors executor-service templates).

This module generates SQL previews for display purposes.
The executor-service independently re-generates SQL from params before execution.
"""

import re

_SAFE_IDENT = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]{0,63}$")


def _q(name: str) -> str:
    if not name or not _SAFE_IDENT.match(name):
        raise ValueError(f"Invalid identifier: {name!r}")
    return f"`{name}`"


def _esc(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def _scope(db: str | None, table: str | None) -> str:
    if not db or db == "*":
        return "*.*"
    d = _q(db)
    if not table or table == "*":
        return f"{d}.*"
    return f"{d}.{_q(table)}"


def generate_sql_preview(operation_type: str, params: dict) -> tuple[str, str | None]:
    """Return (sql_preview, compensation_sql) for an operation.

    Passwords are masked in the preview.
    """
    try:
        return _GENERATORS[operation_type](params)
    except KeyError:
        return f"-- Unknown operation: {operation_type}", None
    except (ValueError, KeyError) as e:
        return f"-- Error: {e}", None


def _create_user(p: dict) -> tuple[str, str | None]:
    u = _q(p["username"])
    sql = f"CREATE USER {u} IDENTIFIED WITH sha256_password BY '***'"
    host_ips = p.get("host_ip") or []
    if host_ips:
        hosts = ", ".join(f"'{_esc(h)}'" for h in host_ips)
        sql += f" HOST IP {hosts}"
    default_roles = p.get("default_roles") or []
    if default_roles:
        sql += f" DEFAULT ROLE {', '.join(_q(r) for r in default_roles)}"
    return sql, f"DROP USER IF EXISTS {u}"


def _alter_user_password(p: dict) -> tuple[str, str | None]:
    u = _q(p["username"])
    return f"ALTER USER {u} IDENTIFIED WITH sha256_password BY '***'", None


def _drop_user(p: dict) -> tuple[str, str | None]:
    u = _q(p["username"])
    return f"DROP USER IF EXISTS {u}", None


def _create_role(p: dict) -> tuple[str, str | None]:
    r = _q(p["role_name"])
    return f"CREATE ROLE {r}", f"DROP ROLE IF EXISTS {r}"


def _drop_role(p: dict) -> tuple[str, str | None]:
    r = _q(p["role_name"])
    return f"DROP ROLE IF EXISTS {r}", None


def _grant_role(p: dict) -> tuple[str, str | None]:
    role = _q(p["role_name"])
    target = _q(p["target_name"])
    return f"GRANT {role} TO {target}", f"REVOKE {role} FROM {target}"


def _revoke_role(p: dict) -> tuple[str, str | None]:
    role = _q(p["role_name"])
    target = _q(p["target_name"])
    return f"REVOKE {role} FROM {target}", f"GRANT {role} TO {target}"


def _set_default_roles(p: dict) -> tuple[str, str | None]:
    u = _q(p["username"])
    roles = p.get("roles", [])
    if isinstance(roles, list) and roles:
        r = ", ".join(_q(r) for r in roles)
    elif roles == "ALL":
        r = "ALL"
    else:
        r = "NONE"
    return f"SET DEFAULT ROLE {r} TO {u}", None


def _grant_privilege(p: dict) -> tuple[str, str | None]:
    priv = p["privilege"].upper()
    s = _scope(p.get("database"), p.get("table"))
    target = _q(p["target_name"])
    return f"GRANT {priv} ON {s} TO {target}", f"REVOKE {priv} ON {s} FROM {target}"


def _revoke_privilege(p: dict) -> tuple[str, str | None]:
    priv = p["privilege"].upper()
    s = _scope(p.get("database"), p.get("table"))
    target = _q(p["target_name"])
    return f"REVOKE {priv} ON {s} FROM {target}", f"GRANT {priv} ON {s} TO {target}"


def _create_settings_profile(p: dict) -> tuple[str, str | None]:
    n = _q(p["name"])
    settings = p.get("settings", {})
    parts = [f"{k} = {v}" for k, v in settings.items()]
    clause = ", ".join(parts)
    return f"CREATE SETTINGS PROFILE {n} SETTINGS {clause}", f"DROP SETTINGS PROFILE IF EXISTS {n}"


def _alter_settings_profile(p: dict) -> tuple[str, str | None]:
    n = _q(p["name"])
    settings = p.get("settings", {})
    parts = [f"{k} = {v}" for k, v in settings.items()]
    clause = ", ".join(parts)
    return f"ALTER SETTINGS PROFILE {n} SETTINGS {clause}", None


def _drop_settings_profile(p: dict) -> tuple[str, str | None]:
    n = _q(p["name"])
    return f"DROP SETTINGS PROFILE IF EXISTS {n}", None


def _assign_settings_profile(p: dict) -> tuple[str, str | None]:
    target = _q(p["target_name"])
    profile = _q(p["profile_name"])
    return f"ALTER USER {target} SETTINGS PROFILE {profile}", None


def _create_quota(p: dict) -> tuple[str, str | None]:
    n = _q(p["name"])
    intervals = p.get("intervals", [])
    parts = []
    for iv in intervals:
        dur = iv.get("duration", "1 hour")
        limits = iv.get("limits", {})
        lp = ", ".join(f"{k} = {v}" for k, v in limits.items())
        parts.append(f"FOR INTERVAL {dur} MAX {lp}")
    return f"CREATE QUOTA {n} {' '.join(parts)}", f"DROP QUOTA IF EXISTS {n}"


def _alter_quota(p: dict) -> tuple[str, str | None]:
    n = _q(p["name"])
    intervals = p.get("intervals", [])
    parts = []
    for iv in intervals:
        dur = iv.get("duration", "1 hour")
        limits = iv.get("limits", {})
        lp = ", ".join(f"{k} = {v}" for k, v in limits.items())
        parts.append(f"FOR INTERVAL {dur} MAX {lp}")
    return f"ALTER QUOTA {n} {' '.join(parts)}", None


def _drop_quota(p: dict) -> tuple[str, str | None]:
    n = _q(p["name"])
    return f"DROP QUOTA IF EXISTS {n}", None


def _assign_quota(p: dict) -> tuple[str, str | None]:
    target = _q(p["target_name"])
    quota = _q(p["quota_name"])
    return f"ALTER USER {target} QUOTA {quota}", None


def _create_row_policy(p: dict) -> tuple[str, str | None]:
    name = _q(p["name"])
    db = _q(p["database"])
    table = _q(p["table"])
    condition = p.get("condition", "1")
    restrictive = p.get("restrictive", False)
    pol_type = "RESTRICTIVE" if restrictive else "PERMISSIVE"
    sql = f"CREATE ROW POLICY {name} ON {db}.{table} AS {pol_type} FOR SELECT USING {condition}"
    # Apply to
    apply_to = p.get("apply_to")
    if apply_to:
        targets = ", ".join(_q(t) for t in apply_to)
        sql += f" TO {targets}"
    return sql, f"DROP ROW POLICY IF EXISTS {name} ON {db}.{table}"


def _alter_row_policy(p: dict) -> tuple[str, str | None]:
    name = _q(p["name"])
    db = _q(p["database"])
    table = _q(p["table"])
    parts = [f"ALTER ROW POLICY {name} ON {db}.{table}"]
    condition = p.get("condition")
    if condition:
        parts.append(f"USING {condition}")
    apply_to = p.get("apply_to")
    if apply_to:
        targets = ", ".join(_q(t) for t in apply_to)
        parts.append(f"TO {targets}")
    return " ".join(parts), None


def _drop_row_policy(p: dict) -> tuple[str, str | None]:
    name = _q(p["name"])
    db = _q(p["database"])
    table = _q(p["table"])
    return f"DROP ROW POLICY IF EXISTS {name} ON {db}.{table}", None


_GENERATORS: dict[str, callable] = {
    "create_user": _create_user,
    "alter_user_password": _alter_user_password,
    "drop_user": _drop_user,
    "create_role": _create_role,
    "drop_role": _drop_role,
    "grant_role": _grant_role,
    "revoke_role": _revoke_role,
    "set_default_roles": _set_default_roles,
    "grant_privilege": _grant_privilege,
    "revoke_privilege": _revoke_privilege,
    "create_settings_profile": _create_settings_profile,
    "alter_settings_profile": _alter_settings_profile,
    "drop_settings_profile": _drop_settings_profile,
    "assign_settings_profile": _assign_settings_profile,
    "create_quota": _create_quota,
    "alter_quota": _alter_quota,
    "drop_quota": _drop_quota,
    "assign_quota": _assign_quota,
    "create_row_policy": _create_row_policy,
    "alter_row_policy": _alter_row_policy,
    "drop_row_policy": _drop_row_policy,
}
