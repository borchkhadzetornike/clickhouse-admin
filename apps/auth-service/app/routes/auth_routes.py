from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import LoginRequest, LoginResponse, UserOut
from ..auth import verify_password, create_access_token, get_current_user
from ..audit import emit_audit_event

router = APIRouter()


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.password_hash):
        emit_audit_event(
            db,
            action="login_failed",
            actor=user,  # None if user not found
            severity="warn",
            target_type="user",
            target_name=req.username,
            metadata={"reason": "invalid credentials"},
            request=request,
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account disabled",
        )
    token = create_access_token(user)
    emit_audit_event(
        db,
        action="login_success",
        actor=user,
        target_type="user",
        target_id=user.id,
        target_name=user.username,
        request=request,
    )
    db.commit()
    return LoginResponse(access_token=token)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
