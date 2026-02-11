"""Shared pytest conftest for governance-service tests.
All test infrastructure is defined here and injected via fixtures.
"""

import os

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["ENCRYPTION_KEY"] = "0123456789abcdef0123456789abcdef"

from datetime import datetime, timedelta, timezone  # noqa: E402

import pytest  # noqa: E402
from jose import jwt  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402

_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

# Enable foreign keys on SQLite
@event.listens_for(_engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

_SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def _override_get_db():
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _override_get_db

_JWT_SECRET = "test-secret"


def _make_token(user_id=1, username="admin", role="admin") -> str:
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    return jwt.encode(payload, _JWT_SECRET, algorithm="HS256")


# ── Fixtures ──────────────────────────────────────────────

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=_engine)
    yield
    Base.metadata.drop_all(bind=_engine)


@pytest.fixture
def api():
    """TestClient for the FastAPI app."""
    return TestClient(app)


@pytest.fixture
def admin_headers():
    return {"Authorization": f"Bearer {_make_token(role='admin')}"}


@pytest.fixture
def editor_headers():
    return {"Authorization": f"Bearer {_make_token(role='editor')}"}


@pytest.fixture
def researcher_headers():
    return {"Authorization": f"Bearer {_make_token(role='researcher')}"}


@pytest.fixture
def headers_for():
    """Return headers for a given role."""
    def _fn(role="admin"):
        return {"Authorization": f"Bearer {_make_token(role=role)}"}
    return _fn


@pytest.fixture
def db_session():
    """Direct DB session for test setup/assertions."""
    session = _SessionLocal()
    yield session
    session.close()
