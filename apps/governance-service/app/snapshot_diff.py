"""Snapshot diff engine — compares two RBAC snapshots."""

from __future__ import annotations

import json
from typing import Any


def compute_diff(old_raw: dict, new_raw: dict) -> dict:
    """Compare two raw snapshot dicts and return structured diff."""

    return {
        "users": _diff_by_key(
            old_raw.get("users", []),
            new_raw.get("users", []),
            key_fn=lambda u: u.get("name", ""),
            label="user",
        ),
        "roles": _diff_by_key(
            old_raw.get("roles", []),
            new_raw.get("roles", []),
            key_fn=lambda r: r.get("name", ""),
            label="role",
        ),
        "role_grants": _diff_by_key(
            old_raw.get("role_grants", []),
            new_raw.get("role_grants", []),
            key_fn=_role_grant_key,
            label="role_grant",
        ),
        "grants": _diff_by_key(
            old_raw.get("grants", []),
            new_raw.get("grants", []),
            key_fn=_grant_key,
            label="grant",
        ),
    }


def _diff_by_key(
    old_items: list[dict],
    new_items: list[dict],
    key_fn,
    label: str,
) -> dict:
    old_map = {key_fn(i): i for i in old_items}
    new_map = {key_fn(i): i for i in new_items}

    added = [new_map[k] for k in new_map if k not in old_map]
    removed = [old_map[k] for k in old_map if k not in new_map]

    # Detect modifications (same key, different content)
    modified: list[dict] = []
    for k in old_map:
        if k in new_map and _serialise(old_map[k]) != _serialise(new_map[k]):
            modified.append({"old": old_map[k], "new": new_map[k]})

    return {
        "added": added,
        "removed": removed,
        "modified": modified,
        "added_count": len(added),
        "removed_count": len(removed),
        "modified_count": len(modified),
    }


def _role_grant_key(rg: dict) -> str:
    return (
        f"{rg.get('user_name', '')}|{rg.get('role_name', '')}|"
        f"{rg.get('granted_role_name', '')}"
    )


def _grant_key(g: dict) -> str:
    return (
        f"{g.get('user_name', '')}|{g.get('role_name', '')}|"
        f"{g.get('access_type', '')}|{g.get('database', '')}|"
        f"{g.get('table', '')}|{g.get('column', '')}"
    )


def _serialise(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, default=str)
