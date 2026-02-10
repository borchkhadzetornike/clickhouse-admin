"""Minimal tests for governance-service: JWT auth, proposals, connection test."""

import os
from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.environ["DATABASE_URL"] = "sqlite:///./test_gov.db"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["ENCRYPTION_KEY"] = "0123456789abcdef0123456789abcdef"

from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.encryption import encrypt  # noqa: E402

engine = create_engine(
    "sqlite:///./test_gov.db", connect_args={"check_same_thread": False}
)
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

JWT_SECRET = "test-secret"


def _make_token(user_id=1, username="admin", role="admin") -> str:
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _headers(role="admin") -> dict:
    return {"Authorization": f"Bearer {_make_token(role=role)}"}


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    if os.path.exists("./test_gov.db"):
        os.remove("./test_gov.db")


# ── Tests ────────────────────────────────────────────────


def test_jwt_auth_required():
    resp = client.get("/clusters")
    assert resp.status_code == 403  # No token


def test_create_cluster():
    resp = client.post(
        "/clusters",
        json={
            "name": "test-ch",
            "host": "localhost",
            "port": 8123,
            "protocol": "http",
            "username": "default",
            "password": "",
        },
        headers=_headers("admin"),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "test-ch"
    assert "password" not in data  # password not in response


def test_create_cluster_editor_forbidden():
    resp = client.post(
        "/clusters",
        json={
            "name": "test",
            "host": "localhost",
            "port": 8123,
            "protocol": "http",
            "username": "default",
            "password": "",
        },
        headers=_headers("editor"),
    )
    assert resp.status_code == 403


def test_create_proposal_returns_sql_preview():
    # First create a cluster
    client.post(
        "/clusters",
        json={
            "name": "prop-ch",
            "host": "localhost",
            "port": 8123,
            "protocol": "http",
            "username": "default",
            "password": "",
        },
        headers=_headers("admin"),
    )
    clusters = client.get("/clusters", headers=_headers()).json()
    cluster_id = clusters[0]["id"]

    resp = client.post(
        "/proposals",
        json={
            "cluster_id": cluster_id,
            "proposal_type": "grant_select",
            "db": "analytics",
            "table": "events",
            "target_type": "user",
            "target_name": "readonly_user",
            "reason": "Need read access for reporting",
        },
        headers=_headers("admin"),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "sql_preview" in data
    assert "GRANT SELECT" in data["sql_preview"]
    assert "analytics" in data["sql_preview"]
    assert "events" in data["sql_preview"]
    assert "readonly_user" in data["sql_preview"]
    assert data["status"] == "submitted"


def test_execute_returns_501():
    resp = client.post("/proposals/1/execute", headers=_headers())
    assert resp.status_code == 501


def test_researcher_read_only():
    # Researcher can list clusters
    resp = client.get("/clusters", headers=_headers("researcher"))
    assert resp.status_code == 200

    # Researcher cannot create clusters
    resp = client.post(
        "/clusters",
        json={
            "name": "test",
            "host": "h",
            "port": 8123,
            "protocol": "http",
            "username": "u",
            "password": "p",
        },
        headers=_headers("researcher"),
    )
    assert resp.status_code == 403

    # Researcher cannot create proposals
    resp = client.post(
        "/proposals",
        json={
            "cluster_id": 1,
            "proposal_type": "grant_select",
            "db": "d",
            "table": "t",
            "target_type": "user",
            "target_name": "u",
        },
        headers=_headers("researcher"),
    )
    assert resp.status_code == 403
