import enum

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, Text
from sqlalchemy.sql import func

from .database import Base


class RoleEnum(str, enum.Enum):
    admin = "admin"
    editor = "editor"
    researcher = "researcher"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(RoleEnum), nullable=False, default=RoleEnum.researcher)
    is_active = Column(Boolean, default=True)
    first_name = Column(String(255), nullable=True)
    last_name = Column(String(255), nullable=True)
    email = Column(String(255), nullable=True)
    profile_picture_url = Column(String(1024), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    source = Column(String(50), nullable=False, server_default="auth", index=True)
    action = Column(String(255), nullable=False, index=True)
    severity = Column(String(20), nullable=False, server_default="info")
    actor_user_id = Column(Integer, nullable=True, index=True)
    actor_snapshot = Column(Text, nullable=True)   # JSON: username, role, name, email
    target = Column(String(255), nullable=True)    # simple display string (kept for compat)
    target_json = Column(Text, nullable=True)      # JSON: entity_type, entity_id, entity_name
    request_context = Column(Text, nullable=True)  # JSON: ip, user_agent
    metadata_json = Column(Text, nullable=True)    # JSON: event-specific payload
