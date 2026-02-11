import json
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func

from ..database import get_db
from ..models import Cluster, AuditEvent, Proposal
from ..schemas import (
    ClusterCreate,
    ClusterUpdate,
    ClusterOut,
    ValidateConnectionRequest,
    ConnectionTestResult,
    ClusterDiagnostics,
    TestConnectionResponse,
)
from ..auth import get_current_user, require_role, CurrentUser
from ..encryption import encrypt
from ..clickhouse_client import ClickHouseClient

router = APIRouter(prefix="/clusters", tags=["clusters"])


# ── Helpers ──────────────────────────────────────────────

CRITICAL_FIELDS = {"host", "port", "protocol", "username", "password"}


def _get_active_cluster(db: Session, cluster_id: int) -> Cluster:
    cluster = (
        db.query(Cluster)
        .filter(Cluster.id == cluster_id, Cluster.is_deleted == False)
        .first()
    )
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    return cluster


def _make_client(cluster: Cluster) -> ClickHouseClient:
    return ClickHouseClient(
        host=cluster.host,
        port=cluster.port,
        protocol=cluster.protocol,
        username=cluster.username,
        password_encrypted=cluster.password_encrypted,
        database=cluster.database,
    )


def _make_client_from_params(
    host: str,
    port: int,
    protocol: str,
    username: str,
    password: str,
    database: str | None,
) -> ClickHouseClient:
    return ClickHouseClient(
        host=host,
        port=port,
        protocol=protocol,
        username=username,
        password_encrypted=encrypt(password),
        database=database,
    )


def _persist_test_result(cluster: Cluster, result) -> None:
    """Update cluster row with test/validation results."""
    now = datetime.now(timezone.utc)
    cluster.last_tested_at = now
    cluster.latency_ms = result.latency_ms
    cluster.server_version = result.server_version
    cluster.current_user_detected = result.current_user
    if result.ok:
        cluster.status = "healthy"
        cluster.error_code = None
        cluster.error_message = None
    else:
        cluster.status = "failed"
        cluster.error_code = result.error_code
        cluster.error_message = result.message


# ── List clusters ────────────────────────────────────────

@router.get("", response_model=List[ClusterOut])
def list_clusters(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Cluster)
        .filter(Cluster.is_deleted == False)
        .order_by(Cluster.id)
        .all()
    )


# ── Validate (unsaved params) ───────────────────────────

@router.post("/validate", response_model=ConnectionTestResult)
async def validate_connection(
    req: ValidateConnectionRequest,
    user: CurrentUser = Depends(require_role("admin")),
):
    client = _make_client_from_params(
        host=req.host,
        port=req.port,
        protocol=req.protocol,
        username=req.username,
        password=req.password,
        database=req.database,
    )
    result = await client.validate_connection()
    return ConnectionTestResult(
        ok=result.ok,
        error_code=result.error_code,
        message=result.message,
        suggestions=result.suggestions,
        latency_ms=result.latency_ms,
        server_version=result.server_version,
        current_user=result.current_user,
        raw_error=result.raw_error,
    )


# ── Create cluster ───────────────────────────────────────

@router.post("", response_model=ClusterOut, status_code=201)
def create_cluster(
    req: ClusterCreate,
    user: CurrentUser = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    existing = (
        db.query(Cluster)
        .filter(Cluster.name == req.name, Cluster.is_deleted == False)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Cluster name already exists")
    cluster = Cluster(
        name=req.name,
        host=req.host,
        port=req.port,
        protocol=req.protocol,
        username=req.username,
        password_encrypted=encrypt(req.password),
        database=req.database,
        created_by=user.id,
    )
    db.add(cluster)
    db.flush()
    db.add(
        AuditEvent(
            actor_user_id=user.id,
            action="cluster_created",
            entity_type="cluster",
            entity_id=cluster.id,
            metadata_json=json.dumps({"name": req.name, "host": req.host}),
        )
    )
    db.commit()
    db.refresh(cluster)
    return cluster


# ── Update cluster ───────────────────────────────────────

@router.patch("/{cluster_id}", response_model=ClusterOut)
def update_cluster(
    cluster_id: int,
    req: ClusterUpdate,
    user: CurrentUser = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    cluster = _get_active_cluster(db, cluster_id)
    changes = {}
    update_data = req.model_dump(exclude_unset=True)

    # Check if name conflicts with another cluster
    if "name" in update_data and update_data["name"] != cluster.name:
        conflict = (
            db.query(Cluster)
            .filter(
                Cluster.name == update_data["name"],
                Cluster.is_deleted == False,
                Cluster.id != cluster_id,
            )
            .first()
        )
        if conflict:
            raise HTTPException(status_code=409, detail="Cluster name already exists")

    critical_changed = False
    for field_name, value in update_data.items():
        if field_name == "password":
            if value:
                changes["password"] = "[changed]"
                cluster.password_encrypted = encrypt(value)
                critical_changed = True
        else:
            old_val = getattr(cluster, field_name, None)
            if old_val != value:
                changes[field_name] = {"from": str(old_val), "to": str(value)}
                setattr(cluster, field_name, value)
                if field_name in CRITICAL_FIELDS:
                    critical_changed = True

    # Reset test status if critical fields changed
    if critical_changed:
        cluster.status = "never_tested"
        cluster.last_tested_at = None
        cluster.latency_ms = None
        cluster.server_version = None
        cluster.current_user_detected = None
        cluster.error_code = None
        cluster.error_message = None

    if changes:
        db.add(
            AuditEvent(
                actor_user_id=user.id,
                action="cluster_updated",
                entity_type="cluster",
                entity_id=cluster_id,
                metadata_json=json.dumps(changes),
            )
        )

    db.commit()
    db.refresh(cluster)
    return cluster


# ── Delete cluster (soft) ───────────────────────────────

@router.delete("/{cluster_id}")
def delete_cluster(
    cluster_id: int,
    user: CurrentUser = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    cluster = _get_active_cluster(db, cluster_id)

    # Check dependencies
    proposal_count = (
        db.query(sa_func.count(Proposal.id))
        .filter(Proposal.cluster_id == cluster_id)
        .scalar()
    )

    cluster.is_deleted = True
    db.add(
        AuditEvent(
            actor_user_id=user.id,
            action="cluster_deleted",
            entity_type="cluster",
            entity_id=cluster_id,
            metadata_json=json.dumps({
                "name": cluster.name,
                "had_proposals": proposal_count > 0,
            }),
        )
    )
    db.commit()
    return {
        "ok": True,
        "message": f"Cluster '{cluster.name}' deleted",
        "had_dependencies": proposal_count > 0,
    }


# ── Test connection (saved cluster) ─────────────────────

@router.post("/{cluster_id}/test", response_model=ConnectionTestResult)
async def test_cluster_connection(
    cluster_id: int,
    user: CurrentUser = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    cluster = _get_active_cluster(db, cluster_id)
    client = _make_client(cluster)
    result = await client.validate_connection()
    _persist_test_result(cluster, result)
    db.commit()
    db.refresh(cluster)
    return ConnectionTestResult(
        ok=result.ok,
        error_code=result.error_code,
        message=result.message,
        suggestions=result.suggestions,
        latency_ms=result.latency_ms,
        server_version=result.server_version,
        current_user=result.current_user,
        raw_error=result.raw_error,
    )


# ── Legacy test endpoint (backward compat) ──────────────

@router.post("/{cluster_id}/test-connection", response_model=TestConnectionResponse)
async def test_connection_legacy(
    cluster_id: int,
    user: CurrentUser = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    cluster = _get_active_cluster(db, cluster_id)
    client = _make_client(cluster)
    result = await client.validate_connection()
    _persist_test_result(cluster, result)
    db.commit()
    return TestConnectionResponse(
        success=result.ok,
        message=result.message,
    )


# ── Diagnostics ─────────────────────────────────────────

@router.get("/{cluster_id}/diagnostics", response_model=ClusterDiagnostics)
def get_cluster_diagnostics(
    cluster_id: int,
    user: CurrentUser = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    cluster = _get_active_cluster(db, cluster_id)
    proposal_count = (
        db.query(sa_func.count(Proposal.id))
        .filter(Proposal.cluster_id == cluster_id)
        .scalar()
    )
    return ClusterDiagnostics(
        id=cluster.id,
        name=cluster.name,
        host=cluster.host,
        port=cluster.port,
        protocol=cluster.protocol,
        username=cluster.username,
        database=cluster.database,
        status=cluster.status,
        last_tested_at=cluster.last_tested_at,
        latency_ms=cluster.latency_ms,
        server_version=cluster.server_version,
        current_user_detected=cluster.current_user_detected,
        error_code=cluster.error_code,
        error_message=cluster.error_message,
        created_at=cluster.created_at,
        updated_at=cluster.updated_at,
        dependency_count=proposal_count,
    )
