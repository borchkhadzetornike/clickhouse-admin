from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func

from .database import Base


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    proposal_id = Column(Integer, nullable=False)
    cluster_id = Column(Integer, nullable=False)
    actor_user_id = Column(Integer, nullable=False)
    correlation_id = Column(String(255), unique=True, nullable=False, index=True)
    mode = Column(String(50), nullable=False)           # dry_run | apply
    status = Column(String(50), nullable=False, default="pending")
    # pending | running | completed | failed | partial_failure
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)


class JobStep(Base):
    __tablename__ = "job_steps"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, nullable=False, index=True)
    step_index = Column(Integer, nullable=False)
    operation_type = Column(String(100), nullable=False)
    sql_statement = Column(Text, nullable=False)
    compensation_sql = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default="pending")
    # pending | success | error | skipped | dry_run_ok
    result_message = Column(Text, nullable=True)
    executed_at = Column(DateTime(timezone=True), nullable=True)
