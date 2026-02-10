from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "researcher"


class UpdateUserRequest(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class AuditEventOut(BaseModel):
    id: int
    actor_user_id: Optional[int]
    action: str
    target: Optional[str]
    metadata_json: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
