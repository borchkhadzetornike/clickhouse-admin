from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, RoleEnum
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
    user = User(
        username=req.username,
        password_hash=hash_password(req.password),
        role=RoleEnum(req.role),
        is_active=True,
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
        metadata={"role": req.role},
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
