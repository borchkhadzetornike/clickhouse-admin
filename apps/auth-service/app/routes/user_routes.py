from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, RoleEnum, AuditEvent
from ..schemas import UserOut, CreateUserRequest, UpdateUserRequest
from ..auth import hash_password, require_role
from ..audit import emit_audit_event

router = APIRouter()


@router.get("/users", response_model=List[UserOut])
def list_users(
    admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    return db.query(User).order_by(User.id).all()


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(
    user_id: int,
    admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(
    req: CreateUserRequest,
    request: Request,
    admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    if req.role not in [r.value for r in RoleEnum]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role. Must be one of: {[r.value for r in RoleEnum]}",
        )
    existing = db.query(User).filter(User.username == req.username).first()
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists")
    # Check email uniqueness if provided
    if req.email:
        existing_email = db.query(User).filter(User.email == req.email).first()
        if existing_email:
            raise HTTPException(status_code=409, detail="Email already in use")
    user = User(
        username=req.username,
        password_hash=hash_password(req.password),
        role=RoleEnum(req.role),
        is_active=True,
        first_name=req.first_name,
        last_name=req.last_name,
        email=req.email,
    )
    db.add(user)
    db.flush()
    emit_audit_event(
        db,
        action="user_created",
        actor=admin,
        target_type="user",
        target_id=user.id,
        target_name=user.username,
        metadata={"role": req.role, "email": req.email},
        request=request,
    )
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    req: UpdateUserRequest,
    request: Request,
    admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    changes = {}

    # ── Safety: cannot disable the last active admin ──
    if req.is_active is False and user.role == RoleEnum.admin:
        active_admins = db.query(User).filter(
            User.role == RoleEnum.admin, User.is_active == True, User.id != user.id
        ).count()
        if active_admins == 0:
            raise HTTPException(
                status_code=400,
                detail="Cannot disable the last active admin user",
            )

    # ── Safety: cannot demote the last admin ──
    if req.role is not None and req.role != "admin" and user.role == RoleEnum.admin:
        active_admins = db.query(User).filter(
            User.role == RoleEnum.admin, User.id != user.id
        ).count()
        if active_admins == 0:
            raise HTTPException(
                status_code=400,
                detail="Cannot demote the last admin user. Promote another user first.",
            )

    if req.role is not None:
        if req.role not in [r.value for r in RoleEnum]:
            raise HTTPException(status_code=400, detail="Invalid role")
        user.role = RoleEnum(req.role)
        changes["role"] = req.role
    if req.is_active is not None:
        user.is_active = req.is_active
        changes["is_active"] = req.is_active
    if req.password is not None:
        user.password_hash = hash_password(req.password)
        changes["password"] = "[reset]"  # never log the actual password
    if req.first_name is not None:
        user.first_name = req.first_name
        changes["first_name"] = req.first_name
    if req.last_name is not None:
        user.last_name = req.last_name
        changes["last_name"] = req.last_name
    if req.email is not None:
        # Check email uniqueness
        if req.email:
            existing = db.query(User).filter(User.email == req.email, User.id != user.id).first()
            if existing:
                raise HTTPException(status_code=409, detail="Email already in use")
        user.email = req.email or None
        changes["email"] = req.email
    if req.profile_picture_url is not None:
        user.profile_picture_url = req.profile_picture_url or None
        changes["profile_picture_url"] = "[updated]"

    emit_audit_event(
        db,
        action="user_updated",
        actor=admin,
        target_type="user",
        target_id=user.id,
        target_name=user.username,
        metadata=changes,
        request=request,
    )
    db.commit()
    db.refresh(user)
    return user


@router.get("/users/{user_id}/audit")
def get_user_audit(
    user_id: int,
    limit: int = Query(50, le=200),
    admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Get recent audit events related to a specific user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    events = (
        db.query(AuditEvent)
        .filter(
            (AuditEvent.actor_user_id == user_id) |
            (AuditEvent.target.like(f"%{user.username}%"))
        )
        .order_by(AuditEvent.created_at.desc())
        .limit(limit)
        .all()
    )

    return [
        {
            "id": e.id,
            "action": e.action,
            "severity": getattr(e, "severity", "info"),
            "created_at": e.created_at.isoformat() if e.created_at else None,
            "metadata_json": e.metadata_json,
            "target": e.target,
        }
        for e in events
    ]
