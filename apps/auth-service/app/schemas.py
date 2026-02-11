import re

from pydantic import BaseModel, field_validator
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
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    profile_picture_url: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

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


# ── Profile schemas ───────────────────────────────────────


class ProfileOut(BaseModel):
    id: int
    username: str
    role: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    profile_picture_url: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProfileUpdateRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    profile_picture_url: Optional[str] = None

    @field_validator("first_name", "last_name")
    @classmethod
    def name_must_not_be_blank(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v.strip() == "":
            raise ValueError("Must not be blank")
        return v.strip() if v is not None else v

    @field_validator("email")
    @classmethod
    def email_must_be_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if v == "":
                raise ValueError("Must not be blank")
            pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
            if not re.match(pattern, v):
                raise ValueError("Invalid email format")
        return v

    @field_validator("profile_picture_url")
    @classmethod
    def url_must_be_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if v == "":
                return None  # allow clearing the field
            if not v.startswith(("http://", "https://")):
                raise ValueError("Must be a valid HTTP(S) URL")
        return v


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        return v


# ── Legacy audit schema (kept for backward compat) ────────

class AuditEventOut(BaseModel):
    id: int
    actor_user_id: Optional[int]
    action: str
    target: Optional[str]
    metadata_json: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ── New audit response schemas ────────────────────────────

class AuditActorInfo(BaseModel):
    id: Optional[int] = None
    username: str = "system"
    role: Optional[str] = None
    display_name: str = "System"


class AuditTargetInfo(BaseModel):
    entity_type: Optional[str] = None
    entity_id: Optional[int | str] = None
    entity_name: Optional[str] = None


class AuditListItem(BaseModel):
    id: int
    created_at: datetime
    source: str
    action: str
    severity: str
    actor: AuditActorInfo
    target: Optional[AuditTargetInfo] = None
    summary: str
    metadata_preview: Optional[dict] = None
    has_details: bool


class AuditListResponse(BaseModel):
    items: list[AuditListItem]
    page: int
    page_size: int
    total: int


class AuditDetailOut(BaseModel):
    id: int
    created_at: datetime
    source: str
    action: str
    severity: str
    actor: AuditActorInfo
    actor_snapshot: Optional[dict] = None
    target: Optional[AuditTargetInfo] = None
    request_context: Optional[dict] = None
    metadata: Optional[dict] = None
