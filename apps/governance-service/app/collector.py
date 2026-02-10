"""RBAC collector — fetches users, roles, grants, settings from ClickHouse system tables."""

import json
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .clickhouse_client import ClickHouseClient
from .models import (
    SnapshotRun,
    SnapshotUser,
    SnapshotRole,
    SnapshotRoleGrant,
    SnapshotPrivilege,
)

logger = logging.getLogger(__name__)

# Queries against ClickHouse system tables (all read-only)
_QUERIES = {
    "users": "SELECT * FROM system.users",
    "roles": "SELECT * FROM system.roles",
    "role_grants": "SELECT * FROM system.role_grants",
    "grants": "SELECT * FROM system.grants",
    "settings_profiles": "SELECT * FROM system.settings_profiles",
    "settings_elements": "SELECT * FROM system.settings_profile_elements",
    "quotas": "SELECT * FROM system.quotas",
}


class RBACCollector:
    def __init__(self, client: ClickHouseClient):
        self.client = client

    async def collect_raw(self) -> dict:
        """Fetch all RBAC data from ClickHouse.  Returns a dict of lists."""
        data: dict[str, list] = {}
        for key, query in _QUERIES.items():
            try:
                data[key] = await self.client.execute_json(query)
            except Exception as e:
                logger.warning("Collector: query '%s' failed: %s", key, e)
                data[key] = []
        return data

    @staticmethod
    def normalize_and_store(
        db: Session, snapshot_id: int, raw: dict
    ) -> None:
        """Persist normalised RBAC entities from *raw* into Postgres."""

        # ── users ────────────────────────────────────────
        for u in raw.get("users", []):
            db.add(
                SnapshotUser(
                    snapshot_id=snapshot_id,
                    name=u.get("name", ""),
                    ch_id=str(u.get("id", "")),
                    storage=u.get("storage"),
                    auth_type=u.get("auth_type"),
                    host_ip=json.dumps(u.get("host_ip", [])),
                    host_names=json.dumps(u.get("host_names", [])),
                    default_roles_all=bool(u.get("default_roles_all", 0)),
                    default_roles_list=json.dumps(
                        u.get("default_roles_list", [])
                    ),
                    grantees_any=bool(u.get("grantees_any", 0)),
                    grantees_list=json.dumps(u.get("grantees_list", [])),
                )
            )

        # ── roles ────────────────────────────────────────
        for r in raw.get("roles", []):
            db.add(
                SnapshotRole(
                    snapshot_id=snapshot_id,
                    name=r.get("name", ""),
                    ch_id=str(r.get("id", "")),
                    storage=r.get("storage"),
                )
            )

        # ── role_grants ──────────────────────────────────
        for rg in raw.get("role_grants", []):
            db.add(
                SnapshotRoleGrant(
                    snapshot_id=snapshot_id,
                    user_name=rg.get("user_name") or None,
                    role_name=rg.get("role_name") or None,
                    granted_role_name=rg.get("granted_role_name", ""),
                    is_default=bool(rg.get("granted_role_is_default", 0)),
                    with_admin_option=bool(rg.get("with_admin_option", 0)),
                )
            )

        # ── grants (privileges) ──────────────────────────
        for g in raw.get("grants", []):
            db.add(
                SnapshotPrivilege(
                    snapshot_id=snapshot_id,
                    user_name=g.get("user_name") or None,
                    role_name=g.get("role_name") or None,
                    access_type=g.get("access_type", ""),
                    database=g.get("database") or None,
                    table_name=g.get("table") or None,
                    column_name=g.get("column") or None,
                    is_partial_revoke=bool(g.get("is_partial_revoke", 0)),
                    grant_option=bool(g.get("grant_option", 0)),
                )
            )

        db.flush()


async def run_collection(
    cluster_id: int,
    client: ClickHouseClient,
    db: Session,
) -> SnapshotRun:
    """End-to-end: create snapshot run, collect, normalise, store."""
    run = SnapshotRun(
        cluster_id=cluster_id,
        status="running",
        started_at=datetime.now(timezone.utc),
    )
    db.add(run)
    db.flush()

    try:
        collector = RBACCollector(client)
        raw = await collector.collect_raw()

        run.raw_json = json.dumps(raw, default=str)
        RBACCollector.normalize_and_store(db, run.id, raw)

        run.status = "completed"
        run.completed_at = datetime.now(timezone.utc)
    except Exception as exc:
        logger.exception("Snapshot collection failed for cluster %s", cluster_id)
        run.status = "failed"
        run.error = str(exc)
        run.completed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(run)
    return run
