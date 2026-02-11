"""Audit log endpoints with pagination, filtering, search, and detail view."""

from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, func, cast, String
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AuditEvent, User
from ..schemas import (
    AuditActorInfo,
    AuditTargetInfo,
    AuditListItem,
    AuditListResponse,
    AuditDetailOut,
)
from ..auth import require_role

router = APIRouter()

# ── Human-readable summary generation ─────────────────────

_SUMMARY_MAP: dict[str, str] = {
    "login_success": "Logged in successfully",
    "login_failed": "Failed login attempt",
    "password_changed": "Changed password",
    "password_change_failed": "Failed password change attempt",
    "user_created": "Created a new user account",
    "user_updated": "Updated user account",
    "profile_updated": "Updated profile",
}


def _build_summary(event: AuditEvent) -> str:
    """Generate a human-readable summary for the event."""
    base = _SUMMARY_MAP.get(event.action, event.action.replace("_", " ").title())
    meta = _safe_json(event.metadata_json)

    if event.action == "profile_updated" and meta:
        fields = list(meta.keys())
        if fields:
            return f"Updated profile: {', '.join(fields)}"

    if event.action == "user_created" and event.target:
        role = meta.get("role", "") if meta else ""
        suffix = f" with role {role}" if role else ""
        return f"Created user {event.target}{suffix}"

    if event.action == "user_updated" and event.target and meta:
        fields = list(meta.keys())
        if fields:
            return f"Updated user {event.target}: {', '.join(fields)}"

    if event.action == "login_failed" and event.target:
        return f"Failed login attempt for {event.target}"

    if event.action == "login_success" and event.target:
        return f"Logged in as {event.target}"

    return base


# ── Helpers ───────────────────────────────────────────────

def _safe_json(raw: Optional[str]) -> Optional[dict]:
    """Parse JSON string to dict, or None."""
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


def _build_actor(event: AuditEvent) -> AuditActorInfo:
    snap = _safe_json(event.actor_snapshot)
    if snap:
        parts = [snap.get("first_name") or "", snap.get("last_name") or ""]
        display = " ".join(p for p in parts if p).strip()
        return AuditActorInfo(
            id=event.actor_user_id,
            username=snap.get("username", "unknown"),
            role=snap.get("role"),
            display_name=display or snap.get("username", "unknown"),
        )
    # Fallback: no snapshot (old events)
    if event.actor_user_id is not None:
        return AuditActorInfo(
            id=event.actor_user_id,
            username=event.target or f"user#{event.actor_user_id}",
            display_name=event.target or f"User #{event.actor_user_id}",
        )
    return AuditActorInfo()


def _build_target(event: AuditEvent) -> Optional[AuditTargetInfo]:
    data = _safe_json(event.target_json)
    if data:
        return AuditTargetInfo(**data)
    if event.target:
        return AuditTargetInfo(entity_type="unknown", entity_name=event.target)
    return None


def _metadata_preview(raw: Optional[str], max_keys: int = 4) -> Optional[dict]:
    """Return a small preview of metadata for the list view."""
    data = _safe_json(raw)
    if not data:
        return None
    # Trim to a few keys for the table preview
    keys = list(data.keys())[:max_keys]
    preview = {k: data[k] for k in keys}
    if len(data) > max_keys:
        preview["..."] = f"+{len(data) - max_keys} more"
    return preview


def _to_list_item(event: AuditEvent) -> AuditListItem:
    return AuditListItem(
        id=event.id,
        created_at=event.created_at,
        source=getattr(event, "source", None) or "auth",
        action=event.action,
        severity=getattr(event, "severity", None) or "info",
        actor=_build_actor(event),
        target=_build_target(event),
        summary=_build_summary(event),
        metadata_preview=_metadata_preview(event.metadata_json),
        has_details=bool(event.metadata_json or event.request_context or event.target_json),
    )


# ── GET /audit (paginated list) ──────────────────────────


@router.get("/audit", response_model=AuditListResponse)
def list_audit(
    source: Optional[str] = Query(None, description="auth|governance|executor|all"),
    action: Optional[str] = Query(None),
    actor: Optional[str] = Query(None, description="Username or actor_user_id"),
    severity: Optional[str] = Query(None, description="info|warn|error"),
    from_date: Optional[str] = Query(None, alias="from", description="ISO datetime"),
    to_date: Optional[str] = Query(None, alias="to", description="ISO datetime"),
    q: Optional[str] = Query(None, description="Free-text search"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    user: User = Depends(require_role("admin", "researcher")),
    db: Session = Depends(get_db),
):
    query = db.query(AuditEvent)

    # ── Filters ──
    if source and source != "all":
        query = query.filter(AuditEvent.source == source)
    if action:
        query = query.filter(AuditEvent.action == action)
    if severity:
        query = query.filter(AuditEvent.severity == severity)
    if actor:
        # Try as user_id first, then search in actor_snapshot username
        if actor.isdigit():
            query = query.filter(AuditEvent.actor_user_id == int(actor))
        else:
            query = query.filter(AuditEvent.actor_snapshot.contains(f'"username": "{actor}"'))
    if from_date:
        query = query.filter(AuditEvent.created_at >= from_date)
    if to_date:
        query = query.filter(AuditEvent.created_at <= to_date)
    if q:
        pattern = f"%{q}%"
        query = query.filter(
            or_(
                AuditEvent.action.ilike(pattern),
                AuditEvent.target.ilike(pattern),
                AuditEvent.actor_snapshot.ilike(pattern),
                AuditEvent.metadata_json.ilike(pattern),
            )
        )

    # ── Count ──
    total = query.count()

    # ── Stable sort: created_at DESC, id DESC ──
    query = query.order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())

    # ── Pagination ──
    offset = (page - 1) * page_size
    events = query.offset(offset).limit(page_size).all()

    return AuditListResponse(
        items=[_to_list_item(e) for e in events],
        page=page,
        page_size=page_size,
        total=total,
    )


# ── GET /audit/{id} (full detail) ────────────────────────


@router.get("/audit/{event_id}", response_model=AuditDetailOut)
def get_audit_detail(
    event_id: int,
    user: User = Depends(require_role("admin", "researcher")),
    db: Session = Depends(get_db),
):
    event = db.query(AuditEvent).filter(AuditEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Audit event not found")

    return AuditDetailOut(
        id=event.id,
        created_at=event.created_at,
        source=getattr(event, "source", None) or "auth",
        action=event.action,
        severity=getattr(event, "severity", None) or "info",
        actor=_build_actor(event),
        actor_snapshot=_safe_json(event.actor_snapshot),
        target=_build_target(event),
        request_context=_safe_json(event.request_context),
        metadata=_safe_json(event.metadata_json),
    )
