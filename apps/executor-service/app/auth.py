"""Service-to-service authentication via shared API key."""

from fastapi import Header, HTTPException, status

from .config import INTERNAL_API_KEY


def verify_internal_key(x_internal_api_key: str = Header(...)):
    if x_internal_api_key != INTERNAL_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid internal API key",
        )
