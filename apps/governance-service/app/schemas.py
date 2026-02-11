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


class ClusterUpdate(BaseModel):
    name: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    protocol: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
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
    status: str
    last_tested_at: Optional[datetime] = None
    latency_ms: Optional[int] = None
    server_version: Optional[str] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ValidateConnectionRequest(BaseModel):
    host: str
    port: int = 8123
    protocol: str = "http"
    username: str
    password: str
    database: Optional[str] = None


class ConnectionTestResult(BaseModel):
    ok: bool
    error_code: Optional[str] = None
    message: str
    suggestions: List[str] = []
    latency_ms: Optional[int] = None
    server_version: Optional[str] = None
    current_user: Optional[str] = None
    raw_error: Optional[str] = None


class ClusterDiagnostics(BaseModel):
    id: int
    name: str
    host: str
    port: int
    protocol: str
    username: str
    database: Optional[str]
    status: str
    last_tested_at: Optional[datetime] = None
    latency_ms: Optional[int] = None
    server_version: Optional[str] = None
    current_user_detected: Optional[str] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    dependency_count: int = 0

    class Config:
        from_attributes = True


class TestConnectionResponse(BaseModel):
    """Legacy test response — kept for backward compatibility."""
    success: bool
    message: str


# ── Explorer ─────────────────────────────────────────────


class DatabaseOut(BaseModel):
    name: str
    table_count: int = 0
    is_system: bool = False


class TableOut(BaseModel):
    name: str
    engine: Optional[str] = None
    total_rows: Optional[int] = None
    total_bytes: Optional[int] = None
    last_modified: Optional[str] = None


class ColumnOut(BaseModel):
    name: str
    type: str


class ColumnRich(BaseModel):
    name: str
    type: str
    default_kind: str = ""
    default_expression: str = ""
    comment: str = ""
    is_in_primary_key: bool = False
    is_in_sorting_key: bool = False
    codec: str = ""


class TableMetadata(BaseModel):
    engine: str = ""
    engine_full: str = ""
    partition_key: str = ""
    sorting_key: str = ""
    primary_key: str = ""
    sampling_key: str = ""
    total_rows: Optional[int] = None
    total_bytes: Optional[int] = None
    lifetime_rows: Optional[int] = None
    lifetime_bytes: Optional[int] = None
    last_modified: Optional[str] = None
    comment: str = ""


class SampleColumn(BaseModel):
    name: str
    type: str


class TableSample(BaseModel):
    columns: List[SampleColumn] = []
    rows: List[dict] = []
    rows_read: int = 0
    elapsed_ms: int = 0
    error: Optional[str] = None


class TableDetail(BaseModel):
    database: str
    table: str
    columns: List[ColumnRich] = []
    metadata: TableMetadata = TableMetadata()
    ddl: str = ""
    sample: Optional[TableSample] = None


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


class RiskIndicator(BaseModel):
    level: str  # high / medium / low
    type: str
    message: str
    privilege: str = ""
    source: str = ""
    path: List[str] = []


class RiskSummaryOut(BaseModel):
    high_count: int = 0
    medium_count: int = 0
    low_count: int = 0
    orphan_roles: List[str] = []
    users_with_risks: List[str] = []
    total_users: int = 0
    total_roles: int = 0


# ── Phase 3: Proposal Operations ─────────────────────

class OperationInput(BaseModel):
    operation_type: str
    params: dict


class ProposalCreateV2(BaseModel):
    cluster_id: int
    title: str
    operations: List[OperationInput]
    reason: Optional[str] = None
    is_elevated: bool = False
    description: Optional[str] = None


class OperationOut(BaseModel):
    id: int
    order_index: int
    operation_type: str
    params_json: str
    sql_preview: Optional[str] = None
    compensation_sql: Optional[str] = None

    class Config:
        from_attributes = True


class ProposalOutV2(BaseModel):
    id: int
    cluster_id: int
    created_by: int
    status: str
    type: str
    title: Optional[str] = None
    description: Optional[str] = None
    sql_preview: Optional[str] = None
    compensation_sql: Optional[str] = None
    reason: Optional[str] = None
    is_elevated: bool = False
    job_id: Optional[int] = None
    executed_by: Optional[int] = None
    executed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    operations: List[OperationOut] = []
    # Phase-1 legacy fields
    db_name: Optional[str] = None
    table_name: Optional[str] = None
    target_type: Optional[str] = None
    target_name: Optional[str] = None

    class Config:
        from_attributes = True


# ── Phase 3: Job results (proxied from executor) ─────

class JobStepOut(BaseModel):
    step_index: int
    operation_type: str
    sql_statement: str
    compensation_sql: Optional[str] = None
    status: str
    result_message: Optional[str] = None
    executed_at: Optional[datetime] = None


class JobOut(BaseModel):
    id: int
    proposal_id: int
    cluster_id: int
    mode: str
    status: str
    error: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    steps: List[JobStepOut] = []


# ── Phase 3: Entity History ──────────────────────────

class EntityHistoryOut(BaseModel):
    id: int
    cluster_id: int
    entity_type: str
    entity_name: str
    action: str
    details_json: Optional[str] = None
    proposal_id: Optional[int] = None
    job_id: Optional[int] = None
    actor_user_id: Optional[int] = None
    approved_by_user_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Phase 3: Admin entities ──────────────────────────

class AdminUserOut(BaseModel):
    name: str
    auth_type: Optional[str] = None
    host_ip: List = []
    roles: List[str] = []
    default_roles: List[str] = []
    settings_profiles: List[str] = []
    quotas: List[str] = []


class AdminRoleOut(BaseModel):
    name: str
    members: List[str] = []
    inherited_roles: List[str] = []
    direct_grants: List[dict] = []


class AdminSettingsProfileOut(BaseModel):
    name: str
    settings: List[dict] = []
    assigned_to: List[str] = []


class AdminQuotaOut(BaseModel):
    name: str
    intervals: List[dict] = []
    assigned_to: List[str] = []


class AdminRowPolicyOut(BaseModel):
    name: str
    database: str = ""
    table: str = ""
    select_filter: str = ""
    restrictive: bool = False
    apply_to_all: bool = False
    apply_to_roles: List[str] = []
    apply_to_except: List[str] = []


class SQLPreviewRequest(BaseModel):
    operation_type: str
    params: dict


class SQLPreviewResponse(BaseModel):
    sql: str
    compensation_sql: Optional[str] = None
    warnings: List[str] = []
