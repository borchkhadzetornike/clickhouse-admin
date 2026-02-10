"""HTTP client for calling executor-service (service-to-service)."""

import logging

import httpx

from .config import EXECUTOR_URL, INTERNAL_API_KEY

logger = logging.getLogger(__name__)

_HEADERS = {"X-Internal-Api-Key": INTERNAL_API_KEY}


async def create_job(payload: dict) -> dict:
    """POST /jobs on executor-service."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{EXECUTOR_URL}/jobs",
            json=payload,
            headers=_HEADERS,
        )
        resp.raise_for_status()
        return resp.json()


async def get_job(job_id: int) -> dict:
    """GET /jobs/{id} on executor-service."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{EXECUTOR_URL}/jobs/{job_id}",
            headers=_HEADERS,
        )
        resp.raise_for_status()
        return resp.json()


async def list_jobs_for_proposal(proposal_id: int) -> list[dict]:
    """GET /jobs?proposal_id=X on executor-service."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{EXECUTOR_URL}/jobs",
            params={"proposal_id": proposal_id},
            headers=_HEADERS,
        )
        resp.raise_for_status()
        return resp.json()
