"""ClickHouse statement executor — controlled, template-based execution."""

import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from .models import Job, JobStep
from .schemas import CreateJobRequest
from .templates import build_sql, TemplateError
from .encryption import decrypt

logger = logging.getLogger(__name__)


class ExecutionError(Exception):
    pass


async def _ch_execute(host: str, port: int, protocol: str,
                      username: str, password: str, sql: str) -> str:
    """Execute a single SQL statement against ClickHouse and return result text."""
    base_url = f"{protocol}://{host}:{port}"
    async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
        resp = await client.post(
            base_url,
            params={"user": username, "password": password},
            content=sql,
        )
        resp.raise_for_status()
        return resp.text.strip()


async def run_job(request: CreateJobRequest, db: Session) -> Job:
    """Execute a job: validate, optionally execute, record results."""

    # ── Idempotency check ──────────────────────────────────
    existing = db.query(Job).filter(
        Job.correlation_id == request.correlation_id
    ).first()
    if existing:
        return existing

    # ── Decrypt cluster credentials ─────────────────────────
    try:
        ch_password = decrypt(request.cluster_config.password_encrypted)
    except Exception as e:
        raise ExecutionError(f"Failed to decrypt cluster password: {e}")

    ch_host = request.cluster_config.host
    ch_port = request.cluster_config.port
    ch_proto = request.cluster_config.protocol
    ch_user = request.cluster_config.username

    # ── Create job record ──────────────────────────────────
    job = Job(
        proposal_id=request.proposal_id,
        cluster_id=request.cluster_id,
        actor_user_id=request.actor_user_id,
        correlation_id=request.correlation_id,
        mode=request.mode,
        status="running",
    )
    db.add(job)
    db.flush()

    # ── Build SQL for each operation ────────────────────────
    steps: list[JobStep] = []
    sorted_ops = sorted(request.operations, key=lambda o: o.order_index)

    for op in sorted_ops:
        try:
            forward_sql, comp_sql = build_sql(op.operation_type, op.params)
        except TemplateError as e:
            step = JobStep(
                job_id=job.id,
                step_index=op.order_index,
                operation_type=op.operation_type,
                sql_statement=f"-- TEMPLATE ERROR: {e}",
                compensation_sql=None,
                status="error",
                result_message=str(e),
                executed_at=datetime.now(timezone.utc),
            )
            steps.append(step)
            db.add(step)
            # Mark remaining as skipped
            for remaining in sorted_ops[sorted_ops.index(op) + 1:]:
                try:
                    rem_sql, rem_comp = build_sql(remaining.operation_type, remaining.params)
                except TemplateError:
                    rem_sql = f"-- TEMPLATE ERROR for {remaining.operation_type}"
                    rem_comp = None
                skip = JobStep(
                    job_id=job.id,
                    step_index=remaining.order_index,
                    operation_type=remaining.operation_type,
                    sql_statement=rem_sql,
                    compensation_sql=rem_comp,
                    status="skipped",
                    result_message="Skipped due to earlier error",
                )
                steps.append(skip)
                db.add(skip)
            job.status = "failed"
            job.error = f"Template error at step {op.order_index}: {e}"
            job.completed_at = datetime.now(timezone.utc)
            db.commit()
            return job

        step = JobStep(
            job_id=job.id,
            step_index=op.order_index,
            operation_type=op.operation_type,
            sql_statement=forward_sql,
            compensation_sql=comp_sql,
            status="pending",
        )
        steps.append(step)
        db.add(step)

    db.flush()

    # ── Dry-run mode: just validate and return ──────────────
    if request.mode == "dry_run":
        for step in steps:
            step.status = "dry_run_ok"
            step.result_message = "Validation passed"
            step.executed_at = datetime.now(timezone.utc)
        job.status = "completed"
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
        return job

    # ── Apply mode: execute each step ───────────────────────
    failed = False
    for step in steps:
        if failed:
            step.status = "skipped"
            step.result_message = "Skipped due to earlier failure"
            continue

        try:
            # Mask passwords in logs
            log_sql = step.sql_statement
            if "BY '" in log_sql:
                log_sql = log_sql[:log_sql.index("BY '") + 4] + "***'"
            logger.info("Executing step %d: %s", step.step_index, log_sql)

            result = await _ch_execute(
                ch_host, ch_port, ch_proto, ch_user, ch_password,
                step.sql_statement,
            )
            step.status = "success"
            step.result_message = result or "OK"
            step.executed_at = datetime.now(timezone.utc)
        except httpx.HTTPStatusError as e:
            err_msg = e.response.text[:500] if e.response else str(e)
            logger.error("Step %d failed: %s", step.step_index, err_msg)
            step.status = "error"
            step.result_message = err_msg
            step.executed_at = datetime.now(timezone.utc)
            failed = True

    # ── Determine final job status ──────────────────────────
    statuses = {s.status for s in steps}
    if "error" in statuses and "success" in statuses:
        job.status = "partial_failure"
    elif "error" in statuses:
        job.status = "failed"
    else:
        job.status = "completed"

    job.completed_at = datetime.now(timezone.utc)
    if "error" in statuses:
        failed_steps = [s for s in steps if s.status == "error"]
        job.error = f"Failed at step(s): {[s.step_index for s in failed_steps]}"

    db.commit()
    return job
