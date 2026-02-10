"""JWT validation for governance-service (no token creation — that's auth-service's job)."""

from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from .config import JWT_SECRET, JWT_ALGORITHM

security = HTTPBearer()


class CurrentUser:
    """Lightweight user object extracted from JWT payload."""

    def __init__(self, id: int, username: str, role: str):
        self.id = id
        self.username = username
        self.role = role


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> CurrentUser:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload.get("sub"))
        username = payload.get("username")
        role = payload.get("role")
    except (JWTError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )
    return CurrentUser(id=user_id, username=username, role=role)


def require_role(*roles):
    def checker(user: CurrentUser = Depends(get_current_user)):
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return checker
