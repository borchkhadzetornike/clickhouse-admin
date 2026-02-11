"""Centralised audit event creation with actor snapshots and request context.

Usage:
    from .audit import emit_audit_event

    emit_audit_event(
        db,
        action="profile_updated",
        actor=user,
        request=request,
        target_type="user",
        target_name=user.username,
        metadata={"first_name": {"from": "Old", "to": "New"}},
    )
"""

from __future__ import annotations

import json
from typing import Any, Optional, Union

from fastapi import Request
from sqlalchemy.orm import Session

from .models import AuditEvent, User


def _actor_snapshot(actor: User) -> dict:
    """Capture the actor's identity at event time."""
    role = actor.role.value if hasattr(actor.role, "value") else actor.role
    return {
        "username": actor.username,
        "role": role,
        "first_name": getattr(actor, "first_name", None),
        "last_name": getattr(actor, "last_name", None),
        "email": getattr(actor, "email", None),
    }


def _request_context(request: Optional[Request]) -> Optional[dict]:
    """Extract IP and User-Agent from the FastAPI request."""
    if request is None:
        return None
    return {
        "ip": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent"),
    }


def _target_dict(
    target_type: Optional[str],
    target_id: Optional[Union[int, str]],
    target_name: Optional[str],
) -> Optional[dict]:
    if not target_type:
        return None
    return {
        "entity_type": target_type,
        "entity_id": target_id,
        "entity_name": target_name,
    }


def emit_audit_event(
    db: Session,
    *,
    action: str,
    actor: Optional[User] = None,
    source: str = "auth",
    severity: str = "info",
    target_type: Optional[str] = None,
    target_id: Optional[Union[int, str]] = None,
    target_name: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
    request: Optional[Request] = None,
) -> AuditEvent:
    """Create and add an audit event to the session (caller must commit)."""
    actor_snap = json.dumps(_actor_snapshot(actor)) if actor else None
    target_data = _target_dict(target_type, target_id, target_name)
    target_str = target_name or (
        f"{target_type}:{target_id}" if target_type else None
    )

    event = AuditEvent(
        source=source,
        action=action,
        severity=severity,
        actor_user_id=actor.id if actor else None,
        actor_snapshot=actor_snap,
        target=target_str,
        target_json=json.dumps(target_data) if target_data else None,
        request_context=json.dumps(_request_context(request)) if request else None,
        metadata_json=json.dumps(metadata, default=str) if metadata else None,
    )
    db.add(event)
    return event
