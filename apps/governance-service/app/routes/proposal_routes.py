import json
import uuid
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    Proposal,
    ProposalOperation,
    ProposalReview,
    ProposalStatus,
    ProposalType,
    AuditEvent,
    EntityHistory,
    Cluster,
)
from ..schemas import (
    ProposalCreate,
    ProposalOut,
    ProposalCreateV2,
    ProposalOutV2,
    OperationOut,
    ReviewCreate,
    JobOut,
)
from ..auth import get_current_user, require_role, CurrentUser
from ..sql_generator import generate_sql_preview
from ..encryption import decrypt
from .. import executor_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/proposals", tags=["proposals"])


# ── Helpers ──────────────────────────────────────────────

def _generate_sql(
    proposal_type: str, db: str, table: str, target_type: str, target_name: str
) -> str:
    """Generate a SQL preview string for Phase-1 proposals."""
    if proposal_type == "grant_select":
        return f"GRANT SELECT ON `{db}`.`{table}` TO {target_name}"
    elif proposal_type == "revoke_select":
        return f"REVOKE SELECT ON `{db}`.`{table}` FROM {target_name}"
    raise ValueError(f"Unknown proposal type: {proposal_type}")


def _proposal_to_v2(proposal: Proposal, db: Session) -> ProposalOutV2:
    ops = (
        db.query(ProposalOperation)
        .filter(ProposalOperation.proposal_id == proposal.id)
        .order_by(ProposalOperation.order_index)
        .all()
    )
    return ProposalOutV2(
        id=proposal.id,
        cluster_id=proposal.cluster_id,
        created_by=proposal.created_by,
        status=proposal.status.value if hasattr(proposal.status, 'value') else str(proposal.status),
        type=proposal.type.value if hasattr(proposal.type, 'value') else str(proposal.type),
        title=proposal.title,
        description=proposal.description,
        sql_preview=proposal.sql_preview,
        compensation_sql=proposal.compensation_sql,
        reason=proposal.reason,
        is_elevated=proposal.is_elevated or False,
        job_id=proposal.job_id,
        executed_by=proposal.executed_by,
        executed_at=proposal.executed_at,
        created_at=proposal.created_at,
        updated_at=proposal.updated_at,
        db_name=proposal.db_name,
        table_name=proposal.table_name,
        target_type=proposal.target_type,
        target_name=proposal.target_name,
        operations=[OperationOut.model_validate(o) for o in ops],
    )


# ── Phase 1 — legacy create (kept for backward compat) ──

@router.post("/legacy", response_model=ProposalOutV2, status_code=201)
def create_proposal_legacy(
    req: ProposalCreate,
    user: CurrentUser = Depends(require_role("admin", "editor")),
    db: Session = Depends(get_db),
):
    valid_types = [t.value for t in ProposalType if t != ProposalType.multi_operation]
    if req.proposal_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid proposal type. Must be one of: {valid_types}",
        )
    if req.target_type not in ("user", "role"):
        raise HTTPException(status_code=400, detail="target_type must be 'user' or 'role'")
    cluster = db.query(Cluster).filter(Cluster.id == req.cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    sql = _generate_sql(req.proposal_type, req.db, req.table, req.target_type, req.target_name)
    proposal = Proposal(
        cluster_id=req.cluster_id,
        created_by=user.id,
        status=ProposalStatus.submitted,
        type=ProposalType(req.proposal_type),
        db_name=req.db,
        table_name=req.table,
        target_type=req.target_type,
        target_name=req.target_name,
        sql_preview=sql,
        reason=req.reason,
    )
    db.add(proposal)
    db.flush()
    db.add(AuditEvent(
        actor_user_id=user.id,
        action="proposal_created",
        entity_type="proposal",
        entity_id=proposal.id,
        metadata_json=json.dumps({"sql": sql, "type": req.proposal_type}),
    ))
    db.commit()
    db.refresh(proposal)
    return _proposal_to_v2(proposal, db)


# ── Phase 3 — multi-operation create ─────────────────────

@router.post("", response_model=ProposalOutV2, status_code=201)
def create_proposal(
    req: ProposalCreateV2,
    user: CurrentUser = Depends(require_role("admin", "editor")),
    db: Session = Depends(get_db),
):
    cluster = db.query(Cluster).filter(Cluster.id == req.cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    if not req.operations:
        raise HTTPException(status_code=400, detail="At least one operation required")

    # Generate SQL previews for all operations
    all_sql = []
    all_comp = []
    for i, op in enumerate(req.operations):
        sql, comp = generate_sql_preview(op.operation_type, op.params)
        all_sql.append(sql)
        if comp:
            all_comp.append(comp)

    proposal = Proposal(
        cluster_id=req.cluster_id,
        created_by=user.id,
        status=ProposalStatus.submitted,
        type=ProposalType.multi_operation,
        title=req.title,
        description=req.description,
        reason=req.reason,
        is_elevated=req.is_elevated,
        sql_preview="\n".join(all_sql),
        compensation_sql="\n".join(reversed(all_comp)) if all_comp else None,
    )
    db.add(proposal)
    db.flush()

    for i, op in enumerate(req.operations):
        sql, comp = generate_sql_preview(op.operation_type, op.params)
        db.add(ProposalOperation(
            proposal_id=proposal.id,
            order_index=i,
            operation_type=op.operation_type,
            params_json=json.dumps(op.params),
            sql_preview=sql,
            compensation_sql=comp,
        ))

    db.add(AuditEvent(
        actor_user_id=user.id,
        action="proposal_created",
        entity_type="proposal",
        entity_id=proposal.id,
        metadata_json=json.dumps({
            "title": req.title,
            "operations": len(req.operations),
        }),
    ))
    db.commit()
    db.refresh(proposal)
    return _proposal_to_v2(proposal, db)


# ── List & get ──────────────────────────────────────────

@router.get("", response_model=List[ProposalOutV2])
def list_proposals(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    proposals = db.query(Proposal).order_by(Proposal.created_at.desc()).all()
    return [_proposal_to_v2(p, db) for p in proposals]


@router.get("/{proposal_id}", response_model=ProposalOutV2)
def get_proposal(
    proposal_id: int,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    proposal = db.query(Proposal).filter(Proposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return _proposal_to_v2(proposal, db)


# ── Approve / Reject ───────────────────────────────────

@router.post("/{proposal_id}/approve", response_model=ProposalOutV2)
def approve_proposal(
    proposal_id: int,
    req: Optional[ReviewCreate] = None,
    user: CurrentUser = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    proposal = db.query(Proposal).filter(Proposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if proposal.status != ProposalStatus.submitted:
        raise HTTPException(
            status_code=400,
            detail=f"Can only approve submitted proposals (current: {proposal.status.value})",
        )
    proposal.status = ProposalStatus.approved
    db.add(ProposalReview(
        proposal_id=proposal.id,
        reviewer_user_id=user.id,
        decision="approved",
        comment=req.comment if req else None,
    ))
    db.add(AuditEvent(
        actor_user_id=user.id,
        action="proposal_approved",
        entity_type="proposal",
        entity_id=proposal.id,
    ))
    db.commit()
    db.refresh(proposal)
    return _proposal_to_v2(proposal, db)


@router.post("/{proposal_id}/reject", response_model=ProposalOutV2)
def reject_proposal(
    proposal_id: int,
    req: Optional[ReviewCreate] = None,
    user: CurrentUser = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    proposal = db.query(Proposal).filter(Proposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if proposal.status != ProposalStatus.submitted:
        raise HTTPException(
            status_code=400,
            detail=f"Can only reject submitted proposals (current: {proposal.status.value})",
        )
    proposal.status = ProposalStatus.rejected
    db.add(ProposalReview(
        proposal_id=proposal.id,
        reviewer_user_id=user.id,
        decision="rejected",
        comment=req.comment if req else None,
    ))
    db.add(AuditEvent(
        actor_user_id=user.id,
        action="proposal_rejected",
        entity_type="proposal",
        entity_id=proposal.id,
    ))
    db.commit()
    db.refresh(proposal)
    return _proposal_to_v2(proposal, db)


# ── Dry-run ─────────────────────────────────────────────

@router.post("/{proposal_id}/dry-run", response_model=JobOut)
async def dry_run_proposal(
    proposal_id: int,
    user: CurrentUser = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    proposal = db.query(Proposal).filter(Proposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if proposal.status not in (ProposalStatus.approved, ProposalStatus.submitted):
        raise HTTPException(status_code=400, detail="Proposal must be submitted or approved for dry-run")

    cluster = db.query(Cluster).filter(Cluster.id == proposal.cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    ops = (
        db.query(ProposalOperation)
        .filter(ProposalOperation.proposal_id == proposal.id)
        .order_by(ProposalOperation.order_index)
        .all()
    )

    # Build operations payload — for Phase-1 legacy proposals, build from legacy fields
    if not ops and proposal.type != ProposalType.multi_operation:
        operations = [{
            "order_index": 0,
            "operation_type": proposal.type.value,
            "params": {
                "privilege": "SELECT",
                "database": proposal.db_name,
                "table": proposal.table_name,
                "target_type": proposal.target_type,
                "target_name": proposal.target_name,
            },
        }]
    else:
        operations = [{
            "order_index": op.order_index,
            "operation_type": op.operation_type,
            "params": json.loads(op.params_json),
        } for op in ops]

    correlation_id = f"dryrun-{proposal.id}-{uuid.uuid4().hex[:8]}"

    payload = {
        "proposal_id": proposal.id,
        "cluster_id": cluster.id,
        "actor_user_id": user.id,
        "correlation_id": correlation_id,
        "mode": "dry_run",
        "cluster_config": {
            "host": cluster.host,
            "port": cluster.port,
            "protocol": cluster.protocol,
            "username": cluster.username,
            "password_encrypted": cluster.password_encrypted,
        },
        "operations": operations,
    }

    try:
        result = await executor_client.create_job(payload)
        return result
    except Exception as e:
        logger.exception("Dry-run failed")
        raise HTTPException(status_code=502, detail=f"Executor error: {e}")


# ── Execute ─────────────────────────────────────────────

@router.post("/{proposal_id}/execute", response_model=JobOut)
async def execute_proposal(
    proposal_id: int,
    user: CurrentUser = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    proposal = db.query(Proposal).filter(Proposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if proposal.status != ProposalStatus.approved:
        raise HTTPException(
            status_code=400,
            detail=f"Can only execute approved proposals (current: {proposal.status.value})",
        )

    cluster = db.query(Cluster).filter(Cluster.id == proposal.cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    ops = (
        db.query(ProposalOperation)
        .filter(ProposalOperation.proposal_id == proposal.id)
        .order_by(ProposalOperation.order_index)
        .all()
    )

    # Build operations payload
    if not ops and proposal.type != ProposalType.multi_operation:
        operations = [{
            "order_index": 0,
            "operation_type": proposal.type.value,
            "params": {
                "privilege": "SELECT",
                "database": proposal.db_name,
                "table": proposal.table_name,
                "target_type": proposal.target_type,
                "target_name": proposal.target_name,
            },
        }]
    else:
        operations = [{
            "order_index": op.order_index,
            "operation_type": op.operation_type,
            "params": json.loads(op.params_json),
        } for op in ops]

    correlation_id = f"exec-{proposal.id}-{uuid.uuid4().hex[:8]}"

    payload = {
        "proposal_id": proposal.id,
        "cluster_id": cluster.id,
        "actor_user_id": user.id,
        "correlation_id": correlation_id,
        "mode": "apply",
        "cluster_config": {
            "host": cluster.host,
            "port": cluster.port,
            "protocol": cluster.protocol,
            "username": cluster.username,
            "password_encrypted": cluster.password_encrypted,
        },
        "operations": operations,
    }

    # Update proposal status
    proposal.status = ProposalStatus.executing
    proposal.executed_by = user.id
    db.commit()

    try:
        result = await executor_client.create_job(payload)

        # Update proposal based on result
        from datetime import datetime, timezone
        proposal.job_id = result.get("id")
        proposal.executed_at = datetime.now(timezone.utc)
        job_status = result.get("status", "")

        if job_status == "completed":
            proposal.status = ProposalStatus.executed
        elif job_status == "partial_failure":
            proposal.status = ProposalStatus.partially_executed
        else:
            proposal.status = ProposalStatus.failed

        # Record entity history for each successful operation
        for step in result.get("steps", []):
            if step.get("status") == "success":
                op_type = step.get("operation_type", "")
                # Determine entity type and name from the operation
                matching_ops = [o for o in operations if True]
                if step["step_index"] < len(operations):
                    params = operations[step["step_index"]].get("params", {})
                    entity_type, entity_name = _extract_entity(op_type, params)
                    if entity_type:
                        db.add(EntityHistory(
                            cluster_id=cluster.id,
                            entity_type=entity_type,
                            entity_name=entity_name,
                            action=op_type,
                            details_json=json.dumps(params),
                            proposal_id=proposal.id,
                            job_id=result.get("id"),
                            actor_user_id=user.id,
                        ))

        # Audit
        db.add(AuditEvent(
            actor_user_id=user.id,
            action="proposal_executed",
            entity_type="proposal",
            entity_id=proposal.id,
            metadata_json=json.dumps({
                "job_id": result.get("id"),
                "status": job_status,
            }),
        ))
        db.commit()
        db.refresh(proposal)
        return result

    except Exception as e:
        logger.exception("Execute failed")
        proposal.status = ProposalStatus.failed
        db.commit()
        raise HTTPException(status_code=502, detail=f"Executor error: {e}")


def _extract_entity(op_type: str, params: dict) -> tuple[str | None, str]:
    """Determine entity_type and entity_name from an operation."""
    if op_type in ("create_user", "alter_user_password", "drop_user"):
        return "user", params.get("username", "")
    elif op_type in ("create_role", "drop_role"):
        return "role", params.get("role_name", "")
    elif op_type in ("grant_role", "revoke_role"):
        return "role_assignment", f"{params.get('role_name', '')} -> {params.get('target_name', '')}"
    elif op_type in ("grant_privilege", "revoke_privilege"):
        return "privilege", f"{params.get('privilege', '')} on {params.get('database', '*')}.{params.get('table', '*')}"
    elif op_type in ("set_default_roles",):
        return "user", params.get("username", "")
    elif op_type in ("create_settings_profile", "alter_settings_profile", "drop_settings_profile"):
        return "settings_profile", params.get("name", "")
    elif op_type in ("assign_settings_profile",):
        return "settings_profile", f"{params.get('profile_name', '')} -> {params.get('target_name', '')}"
    elif op_type in ("create_quota", "alter_quota", "drop_quota"):
        return "quota", params.get("name", "")
    elif op_type in ("assign_quota",):
        return "quota", f"{params.get('quota_name', '')} -> {params.get('target_name', '')}"
    return None, ""


# ── Jobs for a proposal ─────────────────────────────────

@router.get("/{proposal_id}/jobs", response_model=list[JobOut])
async def get_proposal_jobs(
    proposal_id: int,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    proposal = db.query(Proposal).filter(Proposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    try:
        jobs = await executor_client.list_jobs_for_proposal(proposal_id)
        return jobs
    except Exception as e:
        logger.exception("Failed to fetch jobs")
        raise HTTPException(status_code=502, detail=f"Executor error: {e}")
