"""Admin explorer endpoints: ClickHouse users/roles/profiles/quotas with history."""

import json
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    Cluster,
    SnapshotRun,
    EntityHistory,
)
from ..schemas import (
    AdminUserOut,
    AdminRoleOut,
    AdminSettingsProfileOut,
    AdminQuotaOut,
    EntityHistoryOut,
)
from ..auth import get_current_user, CurrentUser
from ..clickhouse_client import ClickHouseClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


def _get_client(cluster: Cluster) -> ClickHouseClient:
    return ClickHouseClient(
        host=cluster.host,
        port=cluster.port,
        protocol=cluster.protocol,
        username=cluster.username,
        password_encrypted=cluster.password_encrypted,
    )


async def _get_latest_raw(cluster_id: int, db: Session) -> dict | None:
    snap = (
        db.query(SnapshotRun)
        .filter(SnapshotRun.cluster_id == cluster_id, SnapshotRun.status == "completed")
        .order_by(SnapshotRun.completed_at.desc())
        .first()
    )
    if snap and snap.raw_json:
        return json.loads(snap.raw_json)
    return None


# ── Users ──────────────────────────────────────────────

@router.get("/users", response_model=List[AdminUserOut])
async def list_admin_users(
    cluster_id: int = Query(...),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    raw = await _get_latest_raw(cluster_id, db)
    if not raw:
        # Fallback: query ClickHouse directly
        client = _get_client(cluster)
        try:
            users = await client.execute_json("SELECT * FROM system.users")
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"ClickHouse error: {e}")
        raw = {"users": users, "role_grants": [], "settings_profile_elements": [], "quotas": []}

    users_raw = raw.get("users", [])
    role_grants = raw.get("role_grants", [])

    result = []
    for u in users_raw:
        name = u.get("name", "")
        auth_type = u.get("auth_type", "")
        if isinstance(auth_type, list):
            auth_type = ", ".join(str(a) for a in auth_type)
        host_ip = u.get("host_ip", [])
        if not isinstance(host_ip, list):
            host_ip = []

        # Roles for this user
        user_roles = [rg.get("granted_role_name", "") for rg in role_grants
                      if rg.get("user_name") == name]
        default_roles_list = u.get("default_roles_list", [])
        if isinstance(default_roles_list, str):
            try:
                default_roles_list = json.loads(default_roles_list)
            except Exception:
                default_roles_list = []
        if not isinstance(default_roles_list, list):
            default_roles_list = []

        result.append(AdminUserOut(
            name=name,
            auth_type=auth_type,
            host_ip=host_ip,
            roles=user_roles,
            default_roles=default_roles_list,
        ))
    return result


@router.get("/users/{username}/history", response_model=List[EntityHistoryOut])
def get_user_history(
    username: str,
    cluster_id: int = Query(...),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entries = (
        db.query(EntityHistory)
        .filter(
            EntityHistory.cluster_id == cluster_id,
            EntityHistory.entity_type == "user",
            EntityHistory.entity_name == username,
        )
        .order_by(EntityHistory.created_at.desc())
        .limit(100)
        .all()
    )
    return entries


# ── Roles ──────────────────────────────────────────────

@router.get("/roles", response_model=List[AdminRoleOut])
async def list_admin_roles(
    cluster_id: int = Query(...),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    raw = await _get_latest_raw(cluster_id, db)
    if not raw:
        client = _get_client(cluster)
        try:
            roles = await client.execute_json("SELECT * FROM system.roles")
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"ClickHouse error: {e}")
        raw = {"roles": roles, "role_grants": [], "grants": []}

    roles_raw = raw.get("roles", [])
    role_grants = raw.get("role_grants", [])
    grants = raw.get("grants", [])

    result = []
    for r in roles_raw:
        name = r.get("name", "")
        members = list(set(
            rg.get("user_name") or rg.get("role_name", "")
            for rg in role_grants
            if rg.get("granted_role_name") == name
        ))
        inherited = [rg.get("granted_role_name", "") for rg in role_grants
                     if rg.get("role_name") == name]
        role_grants_list = [
            {"access_type": g.get("access_type", ""), "database": g.get("database", ""),
             "table": g.get("table", "")}
            for g in grants if g.get("role_name") == name
        ]
        result.append(AdminRoleOut(
            name=name,
            members=[m for m in members if m],
            inherited_roles=inherited,
            direct_grants=role_grants_list,
        ))
    return result


@router.get("/roles/{role_name}/history", response_model=List[EntityHistoryOut])
def get_role_history(
    role_name: str,
    cluster_id: int = Query(...),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entries = (
        db.query(EntityHistory)
        .filter(
            EntityHistory.cluster_id == cluster_id,
            EntityHistory.entity_type.in_(["role", "role_assignment"]),
            EntityHistory.entity_name.like(f"%{role_name}%"),
        )
        .order_by(EntityHistory.created_at.desc())
        .limit(100)
        .all()
    )
    return entries


# ── Settings Profiles ──────────────────────────────────

@router.get("/settings-profiles", response_model=List[AdminSettingsProfileOut])
async def list_settings_profiles(
    cluster_id: int = Query(...),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    client = _get_client(cluster)
    try:
        profiles = await client.execute_json("SELECT * FROM system.settings_profiles")
        elements = await client.execute_json(
            "SELECT * FROM system.settings_profile_elements"
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ClickHouse error: {e}")

    result = []
    for p in profiles:
        name = p.get("name", "")
        profile_settings = [
            {"name": e.get("setting_name", ""), "value": e.get("value", ""),
             "min": e.get("min", ""), "max": e.get("max", "")}
            for e in elements if e.get("profile_name") == name
        ]
        result.append(AdminSettingsProfileOut(
            name=name,
            settings=profile_settings,
        ))
    return result


@router.get("/settings-profiles/{name}/history", response_model=List[EntityHistoryOut])
def get_profile_history(
    name: str,
    cluster_id: int = Query(...),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entries = (
        db.query(EntityHistory)
        .filter(
            EntityHistory.cluster_id == cluster_id,
            EntityHistory.entity_type == "settings_profile",
            EntityHistory.entity_name.like(f"%{name}%"),
        )
        .order_by(EntityHistory.created_at.desc())
        .limit(100)
        .all()
    )
    return entries


# ── Quotas ─────────────────────────────────────────────

@router.get("/quotas", response_model=List[AdminQuotaOut])
async def list_quotas(
    cluster_id: int = Query(...),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    client = _get_client(cluster)
    try:
        quotas = await client.execute_json("SELECT * FROM system.quotas")
        quota_limits = await client.execute_json(
            "SELECT * FROM system.quota_limits"
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ClickHouse error: {e}")

    result = []
    for q in quotas:
        name = q.get("name", "")
        intervals = [
            {"duration": ql.get("duration", 0),
             "max_queries": ql.get("max_queries", None),
             "max_result_rows": ql.get("max_result_rows", None),
             "max_result_bytes": ql.get("max_result_bytes", None)}
            for ql in quota_limits if ql.get("quota_name") == name
        ]
        result.append(AdminQuotaOut(
            name=name,
            intervals=intervals,
        ))
    return result


@router.get("/quotas/{name}/history", response_model=List[EntityHistoryOut])
def get_quota_history(
    name: str,
    cluster_id: int = Query(...),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entries = (
        db.query(EntityHistory)
        .filter(
            EntityHistory.cluster_id == cluster_id,
            EntityHistory.entity_type == "quota",
            EntityHistory.entity_name.like(f"%{name}%"),
        )
        .order_by(EntityHistory.created_at.desc())
        .limit(100)
        .all()
    )
    return entries
