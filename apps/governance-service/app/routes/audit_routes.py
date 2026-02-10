from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AuditEvent
from ..schemas import AuditEventOut
from ..auth import require_role, CurrentUser

router = APIRouter()


@router.get("/audit", response_model=List[AuditEventOut])
def list_audit(
    action: str = Query(None),
    entity_type: str = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    user: CurrentUser = Depends(require_role("admin", "researcher")),
    db: Session = Depends(get_db),
):
    q = db.query(AuditEvent)
    if action:
        q = q.filter(AuditEvent.action == action)
    if entity_type:
        q = q.filter(AuditEvent.entity_type == entity_type)
    return q.order_by(AuditEvent.created_at.desc()).offset(offset).limit(limit).all()
