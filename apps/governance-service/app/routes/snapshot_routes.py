"""Snapshot collection, listing, and diff endpoints."""

import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Cluster, SnapshotRun, SnapshotUser, SnapshotRole, SnapshotPrivilege
from ..schemas import SnapshotRunOut, SnapshotCollectRequest, SnapshotDiffOut
from ..auth import get_current_user, require_role, CurrentUser
from ..clickhouse_client import ClickHouseClient
from ..collector import run_collection
from ..snapshot_diff import compute_diff

router = APIRouter(prefix="/snapshots", tags=["snapshots"])


def _enrich(run: SnapshotRun, db: Session) -> dict:
    """Add counts to a snapshot run for the response."""
    d = {
        "id": run.id,
        "cluster_id": run.cluster_id,
        "status": run.status,
        "started_at": run.started_at,
        "completed_at": run.completed_at,
        "error": run.error,
        "created_at": run.created_at,
        "user_count": db.query(SnapshotUser).filter(SnapshotUser.snapshot_id == run.id).count(),
        "role_count": db.query(SnapshotRole).filter(SnapshotRole.snapshot_id == run.id).count(),
        "grant_count": db.query(SnapshotPrivilege).filter(SnapshotPrivilege.snapshot_id == run.id).count(),
    }
    return d


@router.get("", response_model=List[SnapshotRunOut])
def list_snapshots(
    cluster_id: int = Query(...),
    limit: int = Query(20, le=100),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    runs = (
        db.query(SnapshotRun)
        .filter(SnapshotRun.cluster_id == cluster_id)
        .order_by(SnapshotRun.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_enrich(r, db) for r in runs]


# NOTE: /diff and /collect must be declared BEFORE /{snapshot_id}
# so FastAPI does not capture "diff" or "collect" as a path parameter.


@router.get("/diff", response_model=SnapshotDiffOut)
def diff_snapshots(
    from_id: int = Query(..., alias="from"),
    to_id: int = Query(..., alias="to"),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    old_run = db.query(SnapshotRun).filter(SnapshotRun.id == from_id).first()
    new_run = db.query(SnapshotRun).filter(SnapshotRun.id == to_id).first()
    if not old_run or not new_run:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    if old_run.status != "completed" or new_run.status != "completed":
        raise HTTPException(status_code=400, detail="Both snapshots must be completed")

    old_raw = json.loads(old_run.raw_json) if old_run.raw_json else {}
    new_raw = json.loads(new_run.raw_json) if new_run.raw_json else {}

    diff = compute_diff(old_raw, new_raw)
    return SnapshotDiffOut(
        from_snapshot_id=from_id,
        to_snapshot_id=to_id,
        **diff,
    )


@router.post("/collect", response_model=SnapshotRunOut)
async def collect_snapshot(
    req: SnapshotCollectRequest,
    user: CurrentUser = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    cluster = db.query(Cluster).filter(Cluster.id == req.cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    client = ClickHouseClient(
        host=cluster.host,
        port=cluster.port,
        protocol=cluster.protocol,
        username=cluster.username,
        password_encrypted=cluster.password_encrypted,
        database=cluster.database,
    )
    run = await run_collection(cluster.id, client, db)
    return _enrich(run, db)


@router.get("/{snapshot_id}", response_model=SnapshotRunOut)
def get_snapshot(
    snapshot_id: int,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    run = db.query(SnapshotRun).filter(SnapshotRun.id == snapshot_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return _enrich(run, db)
