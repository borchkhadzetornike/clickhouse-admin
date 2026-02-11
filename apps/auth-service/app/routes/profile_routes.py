"""Profile management endpoints — any authenticated user can manage their own profile."""

import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import ProfileOut, ProfileUpdateRequest, ChangePasswordRequest
from ..auth import get_current_user, hash_password, verify_password
from ..audit import emit_audit_event

router = APIRouter(prefix="/profile", tags=["profile"])

# ── Simple in-memory rate limiter for password changes ────
_pw_change_attempts: dict[int, list[float]] = defaultdict(list)
_PW_RATE_LIMIT = 5  # max attempts
_PW_RATE_WINDOW = 300  # per 5-minute window (seconds)


def _check_password_rate_limit(user_id: int) -> None:
    now = time.time()
    window_start = now - _PW_RATE_WINDOW
    _pw_change_attempts[user_id] = [
        t for t in _pw_change_attempts[user_id] if t > window_start
    ]
    if len(_pw_change_attempts[user_id]) >= _PW_RATE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many password change attempts. Try again later.",
        )
    _pw_change_attempts[user_id].append(now)


# ── GET /profile ──────────────────────────────────────────


@router.get("", response_model=ProfileOut)
def get_profile(user: User = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    return user


# ── PATCH /profile ────────────────────────────────────────


@router.patch("", response_model=ProfileOut)
def update_profile(
    req: ProfileUpdateRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update the authenticated user's profile fields."""
    changes: dict = {}
    update_data = req.model_dump(exclude_unset=True)

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    for field, value in update_data.items():
        old_value = getattr(user, field)
        if old_value != value:
            setattr(user, field, value)
            changes[field] = {"from": old_value, "to": value}

    if changes:
        emit_audit_event(
            db,
            action="profile_updated",
            actor=user,
            target_type="user",
            target_id=user.id,
            target_name=user.username,
            metadata=changes,
            request=request,
        )
        db.commit()
        db.refresh(user)

    return user


# ── POST /profile/change-password ─────────────────────────


@router.post("/change-password", status_code=status.HTTP_200_OK)
def change_password(
    req: ChangePasswordRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the authenticated user's password."""
    _check_password_rate_limit(user.id)

    if not verify_password(req.current_password, user.password_hash):
        emit_audit_event(
            db,
            action="password_change_failed",
            actor=user,
            severity="warn",
            target_type="user",
            target_id=user.id,
            target_name=user.username,
            metadata={"reason": "incorrect current password"},
            request=request,
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    if req.current_password == req.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must differ from current password",
        )

    user.password_hash = hash_password(req.new_password)
    emit_audit_event(
        db,
        action="password_changed",
        actor=user,
        target_type="user",
        target_id=user.id,
        target_name=user.username,
        request=request,
    )
    db.commit()
    return {"detail": "Password changed successfully"}
