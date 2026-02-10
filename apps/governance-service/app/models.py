import enum

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, Text
from sqlalchemy.sql import func

from .database import Base


class ProposalStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    approved = "approved"
    rejected = "rejected"


class ProposalType(str, enum.Enum):
    grant_select = "grant_select"
    revoke_select = "revoke_select"


class Cluster(Base):
    __tablename__ = "clusters"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False)
    host = Column(String(255), nullable=False)
    port = Column(Integer, nullable=False, default=8123)
    protocol = Column(String(50), nullable=False, default="http")
    username = Column(String(255), nullable=False)
    password_encrypted = Column(Text, nullable=False)
    database = Column(String(255), nullable=True)
    created_by = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Proposal(Base):
    __tablename__ = "proposals"

    id = Column(Integer, primary_key=True, index=True)
    cluster_id = Column(Integer, nullable=False)
    created_by = Column(Integer, nullable=False)
    status = Column(
        Enum(ProposalStatus), nullable=False, default=ProposalStatus.submitted
    )
    type = Column(Enum(ProposalType), nullable=False)
    db_name = Column(String(255), nullable=False)
    table_name = Column(String(255), nullable=False)
    target_type = Column(String(50), nullable=False)  # "user" or "role"
    target_name = Column(String(255), nullable=False)
    sql_preview = Column(Text, nullable=False)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ProposalReview(Base):
    __tablename__ = "proposal_reviews"

    id = Column(Integer, primary_key=True, index=True)
    proposal_id = Column(Integer, nullable=False)
    reviewer_user_id = Column(Integer, nullable=False)
    decision = Column(String(50), nullable=False)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(Integer, primary_key=True, index=True)
    actor_user_id = Column(Integer, nullable=True)
    action = Column(String(255), nullable=False)
    entity_type = Column(String(255), nullable=True)
    entity_id = Column(Integer, nullable=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ── Phase 2: RBAC Snapshots ─────────────────────────────


class SnapshotRun(Base):
    __tablename__ = "snapshot_runs"

    id = Column(Integer, primary_key=True, index=True)
    cluster_id = Column(Integer, nullable=False, index=True)
    status = Column(String(50), nullable=False, default="pending")
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    raw_json = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SnapshotUser(Base):
    __tablename__ = "snapshot_users"

    id = Column(Integer, primary_key=True, index=True)
    snapshot_id = Column(Integer, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    ch_id = Column(String(255), nullable=True)
    storage = Column(String(100), nullable=True)
    auth_type = Column(String(100), nullable=True)
    host_ip = Column(Text, nullable=True)          # JSON array
    host_names = Column(Text, nullable=True)        # JSON array
    default_roles_all = Column(Boolean, default=False)
    default_roles_list = Column(Text, nullable=True)  # JSON array
    grantees_any = Column(Boolean, default=False)
    grantees_list = Column(Text, nullable=True)     # JSON array


class SnapshotRole(Base):
    __tablename__ = "snapshot_roles"

    id = Column(Integer, primary_key=True, index=True)
    snapshot_id = Column(Integer, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    ch_id = Column(String(255), nullable=True)
    storage = Column(String(100), nullable=True)


class SnapshotRoleGrant(Base):
    __tablename__ = "snapshot_role_grants"

    id = Column(Integer, primary_key=True, index=True)
    snapshot_id = Column(Integer, nullable=False, index=True)
    user_name = Column(String(255), nullable=True)
    role_name = Column(String(255), nullable=True)
    granted_role_name = Column(String(255), nullable=False)
    is_default = Column(Boolean, default=False)
    with_admin_option = Column(Boolean, default=False)


class SnapshotPrivilege(Base):
    __tablename__ = "snapshot_privileges"

    id = Column(Integer, primary_key=True, index=True)
    snapshot_id = Column(Integer, nullable=False, index=True)
    user_name = Column(String(255), nullable=True)
    role_name = Column(String(255), nullable=True)
    access_type = Column(String(255), nullable=False)
    database = Column(String(255), nullable=True)
    table_name = Column(String(255), nullable=True)
    column_name = Column(String(255), nullable=True)
    is_partial_revoke = Column(Boolean, default=False)
    grant_option = Column(Boolean, default=False)
