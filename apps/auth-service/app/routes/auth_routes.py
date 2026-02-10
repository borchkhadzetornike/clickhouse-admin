import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, AuditEvent
from ..schemas import LoginRequest, LoginResponse, UserOut
from ..auth import verify_password, create_access_token, get_current_user

router = APIRouter()


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.password_hash):
        # Audit failed login attempt
        db.add(
            AuditEvent(
                actor_user_id=user.id if user else None,
                action="login_failed",
                target=req.username,
                metadata_json=json.dumps({"reason": "invalid credentials"}),
            )
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
    # Audit successful login
    db.add(
        AuditEvent(
            actor_user_id=user.id,
            action="login_success",
            target=user.username,
        )
    )
    db.commit()
    return LoginResponse(access_token=token)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
