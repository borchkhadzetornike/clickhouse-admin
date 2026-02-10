from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime


class ClusterConfig(BaseModel):
    host: str
    port: int = 8123
    protocol: str = "http"
    username: str
    password_encrypted: str


class OperationPayload(BaseModel):
    order_index: int
    operation_type: str
    params: dict


class CreateJobRequest(BaseModel):
    proposal_id: int
    cluster_id: int
    actor_user_id: int
    correlation_id: str
    mode: str  # dry_run | apply
    cluster_config: ClusterConfig
    operations: List[OperationPayload]


class JobStepOut(BaseModel):
    id: int
    step_index: int
    operation_type: str
    sql_statement: str
    compensation_sql: Optional[str] = None
    status: str
    result_message: Optional[str] = None
    executed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class JobOut(BaseModel):
    id: int
    proposal_id: int
    cluster_id: int
    actor_user_id: int
    correlation_id: str
    mode: str
    status: str
    error: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    steps: List[JobStepOut] = []

    class Config:
        from_attributes = True
