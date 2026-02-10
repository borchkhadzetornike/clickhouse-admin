from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ── Cluster ──────────────────────────────────────────────


class ClusterCreate(BaseModel):
    name: str
    host: str
    port: int = 8123
    protocol: str = "http"
    username: str
    password: str
    database: Optional[str] = None


class ClusterOut(BaseModel):
    id: int
    name: str
    host: str
    port: int
    protocol: str
    username: str
    database: Optional[str]
    created_by: int
    created_at: datetime

    class Config:
        from_attributes = True


class TestConnectionResponse(BaseModel):
    success: bool
    message: str


# ── Explorer ─────────────────────────────────────────────


class DatabaseOut(BaseModel):
    name: str


class TableOut(BaseModel):
    name: str
    engine: Optional[str] = None


class ColumnOut(BaseModel):
    name: str
    type: str


# ── Proposals ────────────────────────────────────────────


class ProposalCreate(BaseModel):
    cluster_id: int
    proposal_type: str  # grant_select | revoke_select
    db: str
    table: str
    target_type: str  # user | role
    target_name: str
    reason: Optional[str] = None


class ProposalOut(BaseModel):
    id: int
    cluster_id: int
    created_by: int
    status: str
    type: str
    db_name: str
    table_name: str
    target_type: str
    target_name: str
    sql_preview: str
    reason: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ReviewCreate(BaseModel):
    comment: Optional[str] = None


# ── Audit ────────────────────────────────────────────────


class AuditEventOut(BaseModel):
    id: int
    actor_user_id: Optional[int]
    action: str
    entity_type: Optional[str]
    entity_id: Optional[int]
    metadata_json: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Snapshots ────────────────────────────────────────────


class SnapshotRunOut(BaseModel):
    id: int
    cluster_id: int
    status: str
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error: Optional[str]
    created_at: datetime
    user_count: Optional[int] = None
    role_count: Optional[int] = None
    grant_count: Optional[int] = None

    class Config:
        from_attributes = True


class SnapshotCollectRequest(BaseModel):
    cluster_id: int


# ── RBAC Explorer ────────────────────────────────────────


class CHUserSummary(BaseModel):
    name: str
    auth_type: Optional[str] = None
    host_ip: List = []
    role_count: int = 0
    direct_grant_count: int = 0


class PrivilegeEntry(BaseModel):
    access_type: str
    database: Optional[str] = None
    table: Optional[str] = None
    column: Optional[str] = None
    is_partial_revoke: bool = False
    grant_option: bool = False
    source: str = "direct"
    source_name: str = ""
    path: List[str] = []


class RoleAssignment(BaseModel):
    role_name: str
    is_default: bool = False
    is_direct: bool = True
    path: List[str] = []


class CHUserDetail(BaseModel):
    name: str
    auth_type: Optional[str] = None
    host_ip: List = []
    default_roles_all: bool = False
    default_roles: List[str] = []
    all_roles: List[RoleAssignment] = []
    effective_privileges: List[PrivilegeEntry] = []
    settings_profiles: List = []


class CHRoleSummary(BaseModel):
    name: str
    member_count: int = 0
    direct_grant_count: int = 0


class CHRoleDetail(BaseModel):
    name: str
    direct_grants: List[PrivilegeEntry] = []
    inherited_roles: List[RoleAssignment] = []
    members: List[dict] = []


class ObjectAccessEntry(BaseModel):
    name: str
    entity_type: str
    access_types: List[str] = []
    source: str = ""


class ObjectAccessOut(BaseModel):
    database: str
    table: Optional[str] = None
    entries: List[ObjectAccessEntry] = []


class SnapshotDiffOut(BaseModel):
    from_snapshot_id: int
    to_snapshot_id: int
    users: dict = {}
    roles: dict = {}
    role_grants: dict = {}
    grants: dict = {}
