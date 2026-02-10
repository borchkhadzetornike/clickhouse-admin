"""Minimal tests for auth-service: login, RBAC, admin seed."""

import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Use SQLite for testing
os.environ["DATABASE_URL"] = "sqlite:///./test_auth.db"
os.environ["JWT_SECRET"] = "test-secret"

from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402

engine = create_engine(
    "sqlite:///./test_auth.db", connect_args={"check_same_thread": False}
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


@pytest.fixture(autouse=True)
def setup_db():
    """Create tables before each test, drop after."""
    Base.metadata.create_all(bind=engine)
    # Seed admin manually for tests
    from app.models import User, RoleEnum
    from app.auth import hash_password

    db = TestSession()
    if db.query(User).count() == 0:
        db.add(
            User(
                username="admin",
                password_hash=hash_password("admin"),
                role=RoleEnum.admin,
                is_active=True,
            )
        )
        db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)
    # Clean up test db file
    if os.path.exists("./test_auth.db"):
        os.remove("./test_auth.db")


def _login(username="admin", password="admin") -> str:
    resp = client.post("/login", json={"username": username, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Tests ────────────────────────────────────────────────


def test_login_success():
    resp = client.post("/login", json={"username": "admin", "password": "admin"})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_failure():
    resp = client.post("/login", json={"username": "admin", "password": "wrong"})
    assert resp.status_code == 401


def test_me():
    token = _login()
    resp = client.get("/me", headers=_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == "admin"
    assert data["role"] == "admin"


def test_rbac_admin_can_list_users():
    token = _login()
    resp = client.get("/users", headers=_headers(token))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_rbac_create_user():
    token = _login()
    resp = client.post(
        "/users",
        json={"username": "testuser", "password": "pass123", "role": "editor"},
        headers=_headers(token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["username"] == "testuser"
    assert data["role"] == "editor"


def test_rbac_editor_cannot_list_users():
    # Create editor
    admin_token = _login()
    client.post(
        "/users",
        json={"username": "editor1", "password": "pass", "role": "editor"},
        headers=_headers(admin_token),
    )
    # Login as editor
    editor_token = _login("editor1", "pass")
    resp = client.get("/users", headers=_headers(editor_token))
    assert resp.status_code == 403


def test_audit_login_events():
    # Login to generate audit event
    _login()
    token = _login()
    resp = client.get("/audit", headers=_headers(token))
    assert resp.status_code == 200
    events = resp.json()
    actions = [e["action"] for e in events]
    assert "login_success" in actions
