"""RBAC explorer endpoints — browse users, roles, and object permissions."""

import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    SnapshotRun,
    SnapshotUser,
    SnapshotRole,
    SnapshotRoleGrant,
    SnapshotPrivilege,
)
from ..schemas import (
    CHUserSummary,
    CHUserDetail,
    CHRoleSummary,
    CHRoleDetail,
    ObjectAccessOut,
)
from ..auth import get_current_user, CurrentUser
from ..rbac_graph import RBACGraph

router = APIRouter(prefix="/explorer", tags=["rbac-explorer"])


def _latest_snapshot(cluster_id: int, db: Session) -> SnapshotRun:
    run = (
        db.query(SnapshotRun)
        .filter(
            SnapshotRun.cluster_id == cluster_id,
            SnapshotRun.status == "completed",
        )
        .order_by(SnapshotRun.created_at.desc())
        .first()
    )
    if not run:
        raise HTTPException(
            status_code=404,
            detail="No completed snapshot for this cluster. Collect one first.",
        )
    return run


def _get_snapshot(snapshot_id: int | None, cluster_id: int, db: Session) -> SnapshotRun:
    if snapshot_id:
        run = db.query(SnapshotRun).filter(SnapshotRun.id == snapshot_id).first()
        if not run:
            raise HTTPException(status_code=404, detail="Snapshot not found")
        return run
    return _latest_snapshot(cluster_id, db)


def _build_graph(run: SnapshotRun) -> RBACGraph:
    raw = json.loads(run.raw_json) if run.raw_json else {}
    return RBACGraph(raw)


# ── Users ────────────────────────────────────────────────


@router.get("/users", response_model=List[CHUserSummary])
def list_users(
    cluster_id: int = Query(...),
    snapshot_id: Optional[int] = Query(None),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    run = _get_snapshot(snapshot_id, cluster_id, db)
    graph = _build_graph(run)

    result: list[dict] = []
    for name in graph.user_names:
        roles = graph.resolve_user_roles(name)
        direct_grants = [
            g for g in graph._user_grants.get(name, [])
            if not g.get("is_partial_revoke")
        ]
        info = graph.user_info(name) or {}
        host_ip = info.get("host_ip", [])
        if isinstance(host_ip, str):
            host_ip = json.loads(host_ip)
        auth_type = info.get("auth_type")
        if isinstance(auth_type, list):
            auth_type = ", ".join(str(a) for a in auth_type)
        result.append(
            CHUserSummary(
                name=name,
                auth_type=auth_type,
                host_ip=host_ip if isinstance(host_ip, list) else [],
                role_count=len(roles),
                direct_grant_count=len(direct_grants),
            )
        )
    return result


@router.get("/users/{name}", response_model=CHUserDetail)
def get_user_detail(
    name: str,
    cluster_id: int = Query(...),
    snapshot_id: Optional[int] = Query(None),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    run = _get_snapshot(snapshot_id, cluster_id, db)
    graph = _build_graph(run)

    info = graph.user_info(name)
    if not info:
        raise HTTPException(status_code=404, detail=f"User '{name}' not found in snapshot")

    all_roles = graph.resolve_user_roles(name)
    effective = graph.resolve_effective_privileges(name)

    host_ip = info.get("host_ip", [])
    if isinstance(host_ip, str):
        host_ip = json.loads(host_ip)

    default_roles_list = info.get("default_roles_list", [])
    if isinstance(default_roles_list, str):
        default_roles_list = json.loads(default_roles_list)

    auth_type = info.get("auth_type")
    if isinstance(auth_type, list):
        auth_type = ", ".join(str(a) for a in auth_type)

    settings_profiles = graph.user_settings_profiles(name)

    return CHUserDetail(
        name=name,
        auth_type=auth_type,
        host_ip=host_ip if isinstance(host_ip, list) else [],
        default_roles_all=bool(info.get("default_roles_all", 0)),
        default_roles=default_roles_list if isinstance(default_roles_list, list) else [],
        all_roles=all_roles,
        effective_privileges=effective,
        settings_profiles=settings_profiles,
    )


# ── Roles ────────────────────────────────────────────────


@router.get("/roles", response_model=List[CHRoleSummary])
def list_roles(
    cluster_id: int = Query(...),
    snapshot_id: Optional[int] = Query(None),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    run = _get_snapshot(snapshot_id, cluster_id, db)
    graph = _build_graph(run)

    result: list[dict] = []
    for name in graph.role_names:
        members = graph.role_members(name)
        direct_grants = [
            g for g in graph._role_grants_map.get(name, [])
            if not g.get("is_partial_revoke")
        ]
        result.append(
            CHRoleSummary(
                name=name,
                member_count=len(members),
                direct_grant_count=len(direct_grants),
            )
        )
    return result


@router.get("/roles/{name}", response_model=CHRoleDetail)
def get_role_detail(
    name: str,
    cluster_id: int = Query(...),
    snapshot_id: Optional[int] = Query(None),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    run = _get_snapshot(snapshot_id, cluster_id, db)
    graph = _build_graph(run)

    if name not in graph._roles:
        raise HTTPException(status_code=404, detail=f"Role '{name}' not found in snapshot")

    return CHRoleDetail(
        name=name,
        direct_grants=graph.resolve_role_grants(name),
        inherited_roles=graph.resolve_role_parents(name),
        members=graph.role_members(name),
    )


# ── Objects ──────────────────────────────────────────────


@router.get("/objects/{database}/{table}", response_model=ObjectAccessOut)
def get_object_access(
    database: str,
    table: str,
    cluster_id: int = Query(...),
    snapshot_id: Optional[int] = Query(None),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    run = _get_snapshot(snapshot_id, cluster_id, db)
    graph = _build_graph(run)

    entries = graph.object_access(database, table if table != "*" else None)
    return ObjectAccessOut(database=database, table=table if table != "*" else None, entries=entries)


@router.get("/objects/{database}", response_model=ObjectAccessOut)
def get_database_access(
    database: str,
    cluster_id: int = Query(...),
    snapshot_id: Optional[int] = Query(None),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    run = _get_snapshot(snapshot_id, cluster_id, db)
    graph = _build_graph(run)

    entries = graph.object_access(database, None)
    return ObjectAccessOut(database=database, table=None, entries=entries)
