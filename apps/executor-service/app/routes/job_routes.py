import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Job, JobStep
from ..schemas import CreateJobRequest, JobOut, JobStepOut
from ..auth import verify_internal_key
from ..executor import run_job, ExecutionError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _job_to_out(job: Job, db: Session) -> JobOut:
    steps = (
        db.query(JobStep)
        .filter(JobStep.job_id == job.id)
        .order_by(JobStep.step_index)
        .all()
    )
    return JobOut(
        id=job.id,
        proposal_id=job.proposal_id,
        cluster_id=job.cluster_id,
        actor_user_id=job.actor_user_id,
        correlation_id=job.correlation_id,
        mode=job.mode,
        status=job.status,
        error=job.error,
        created_at=job.created_at,
        completed_at=job.completed_at,
        steps=[JobStepOut.model_validate(s) for s in steps],
    )


@router.post("", response_model=JobOut, status_code=201)
async def create_job(
    request: CreateJobRequest,
    _key=Depends(verify_internal_key),
    db: Session = Depends(get_db),
):
    try:
        job = await run_job(request, db)
        return _job_to_out(job, db)
    except ExecutionError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error creating job")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{job_id}", response_model=JobOut)
def get_job(
    job_id: int,
    _key=Depends(verify_internal_key),
    db: Session = Depends(get_db),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_to_out(job, db)


@router.get("", response_model=List[JobOut])
def list_jobs(
    proposal_id: int | None = None,
    _key=Depends(verify_internal_key),
    db: Session = Depends(get_db),
):
    q = db.query(Job)
    if proposal_id is not None:
        q = q.filter(Job.proposal_id == proposal_id)
    jobs = q.order_by(Job.created_at.desc()).limit(100).all()
    return [_job_to_out(j, db) for j in jobs]
