import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    Proposal,
    ProposalReview,
    ProposalStatus,
    ProposalType,
    AuditEvent,
    Cluster,
)
from ..schemas import ProposalCreate, ProposalOut, ReviewCreate
from ..auth import get_current_user, require_role, CurrentUser

router = APIRouter(prefix="/proposals", tags=["proposals"])


def _generate_sql(
    proposal_type: str, db: str, table: str, target_type: str, target_name: str
) -> str:
    """Generate a SQL preview string. Never executed — MVP preview only."""
    if proposal_type == "grant_select":
        return f"GRANT SELECT ON `{db}`.`{table}` TO {target_name}"
    elif proposal_type == "revoke_select":
        return f"REVOKE SELECT ON `{db}`.`{table}` FROM {target_name}"
    raise ValueError(f"Unknown proposal type: {proposal_type}")


@router.post("", response_model=ProposalOut, status_code=201)
def create_proposal(
    req: ProposalCreate,
    user: CurrentUser = Depends(require_role("admin", "editor")),
    db: Session = Depends(get_db),
):
    # Validate proposal type
    valid_types = [t.value for t in ProposalType]
    if req.proposal_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid proposal type. Must be one of: {valid_types}",
        )
    if req.target_type not in ("user", "role"):
        raise HTTPException(
            status_code=400, detail="target_type must be 'user' or 'role'"
        )
    # Validate cluster exists
    cluster = db.query(Cluster).filter(Cluster.id == req.cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    sql = _generate_sql(
        req.proposal_type, req.db, req.table, req.target_type, req.target_name
    )
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
    db.add(
        AuditEvent(
            actor_user_id=user.id,
            action="proposal_created",
            entity_type="proposal",
            entity_id=proposal.id,
            metadata_json=json.dumps({"sql": sql, "type": req.proposal_type}),
        )
    )
    db.commit()
    db.refresh(proposal)
    return proposal


@router.get("", response_model=List[ProposalOut])
def list_proposals(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(Proposal).order_by(Proposal.created_at.desc()).all()


@router.get("/{proposal_id}", response_model=ProposalOut)
def get_proposal(
    proposal_id: int,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    proposal = db.query(Proposal).filter(Proposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return proposal


@router.post("/{proposal_id}/approve", response_model=ProposalOut)
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
    review = ProposalReview(
        proposal_id=proposal.id,
        reviewer_user_id=user.id,
        decision="approved",
        comment=req.comment if req else None,
    )
    db.add(review)
    db.add(
        AuditEvent(
            actor_user_id=user.id,
            action="proposal_approved",
            entity_type="proposal",
            entity_id=proposal.id,
        )
    )
    db.commit()
    db.refresh(proposal)
    return proposal


@router.post("/{proposal_id}/reject", response_model=ProposalOut)
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
    review = ProposalReview(
        proposal_id=proposal.id,
        reviewer_user_id=user.id,
        decision="rejected",
        comment=req.comment if req else None,
    )
    db.add(review)
    db.add(
        AuditEvent(
            actor_user_id=user.id,
            action="proposal_rejected",
            entity_type="proposal",
            entity_id=proposal.id,
        )
    )
    db.commit()
    db.refresh(proposal)
    return proposal


@router.post("/{proposal_id}/execute")
def execute_proposal(
    proposal_id: int,
    user: CurrentUser = Depends(get_current_user),
):
    """Execution is NOT available in this MVP. Always returns 501."""
    raise HTTPException(
        status_code=501,
        detail="Execution is not available in this MVP. "
        "Proposals can only be previewed and approved.",
    )
