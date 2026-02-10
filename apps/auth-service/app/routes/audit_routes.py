from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AuditEvent, User
from ..schemas import AuditEventOut
from ..auth import require_role

router = APIRouter()


@router.get("/audit", response_model=List[AuditEventOut])
def list_audit(
    action: str = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    q = db.query(AuditEvent)
    if action:
        q = q.filter(AuditEvent.action == action)
    return q.order_by(AuditEvent.created_at.desc()).offset(offset).limit(limit).all()
