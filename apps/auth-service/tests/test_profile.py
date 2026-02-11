"""Tests for profile management endpoints: GET /profile, PATCH /profile, POST /profile/change-password."""

import pytest
from fastapi.testclient import TestClient

from app.database import Base
from app.main import app
from app.models import User, RoleEnum
from app.auth import hash_password
from .conftest import engine, TestSession

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    """Create tables before each test, drop after."""
    Base.metadata.create_all(bind=engine)
    db = TestSession()
    db.add(
        User(
            username="admin",
            password_hash=hash_password("Admin1234"),
            role=RoleEnum.admin,
            is_active=True,
        )
    )
    db.add(
        User(
            username="editor1",
            password_hash=hash_password("Editor1234"),
            role=RoleEnum.editor,
            is_active=True,
        )
    )
    db.add(
        User(
            username="researcher1",
            password_hash=hash_password("Research1234"),
            role=RoleEnum.researcher,
            is_active=True,
        )
    )
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)


def _login(username: str, password: str) -> str:
    resp = client.post("/login", json={"username": username, "password": password})
    assert resp.status_code == 200, f"Login failed for {username}: {resp.text}"
    return resp.json()["access_token"]


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── GET /profile ──────────────────────────────────────────


class TestGetProfile:
    def test_returns_profile_for_admin(self):
        token = _login("admin", "Admin1234")
        resp = client.get("/profile", headers=_headers(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == "admin"
        assert data["role"] == "admin"
        assert "password_hash" not in data
        assert "id" in data

    def test_returns_profile_for_editor(self):
        token = _login("editor1", "Editor1234")
        resp = client.get("/profile", headers=_headers(token))
        assert resp.status_code == 200
        assert resp.json()["username"] == "editor1"
        assert resp.json()["role"] == "editor"

    def test_returns_profile_for_researcher(self):
        token = _login("researcher1", "Research1234")
        resp = client.get("/profile", headers=_headers(token))
        assert resp.status_code == 200
        assert resp.json()["username"] == "researcher1"
        assert resp.json()["role"] == "researcher"

    def test_unauthenticated_returns_403(self):
        resp = client.get("/profile")
        assert resp.status_code == 403

    def test_profile_includes_new_fields(self):
        token = _login("admin", "Admin1234")
        resp = client.get("/profile", headers=_headers(token))
        data = resp.json()
        assert "first_name" in data
        assert "last_name" in data
        assert "email" in data
        assert "profile_picture_url" in data
        assert "created_at" in data


# ── PATCH /profile ────────────────────────────────────────


class TestUpdateProfile:
    def test_update_first_and_last_name(self):
        token = _login("admin", "Admin1234")
        resp = client.patch(
            "/profile",
            json={"first_name": "Jane", "last_name": "Doe"},
            headers=_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["first_name"] == "Jane"
        assert data["last_name"] == "Doe"

    def test_update_email(self):
        token = _login("editor1", "Editor1234")
        resp = client.patch(
            "/profile",
            json={"email": "editor@example.com"},
            headers=_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json()["email"] == "editor@example.com"

    def test_update_profile_picture_url(self):
        token = _login("researcher1", "Research1234")
        resp = client.patch(
            "/profile",
            json={"profile_picture_url": "https://img.example.com/avatar.jpg"},
            headers=_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json()["profile_picture_url"] == "https://img.example.com/avatar.jpg"

    def test_invalid_email_rejected(self):
        token = _login("admin", "Admin1234")
        resp = client.patch(
            "/profile",
            json={"email": "not-an-email"},
            headers=_headers(token),
        )
        assert resp.status_code == 422

    def test_invalid_url_rejected(self):
        token = _login("admin", "Admin1234")
        resp = client.patch(
            "/profile",
            json={"profile_picture_url": "ftp://bad-protocol.com/pic.jpg"},
            headers=_headers(token),
        )
        assert resp.status_code == 422

    def test_blank_name_rejected(self):
        token = _login("admin", "Admin1234")
        resp = client.patch(
            "/profile",
            json={"first_name": "   "},
            headers=_headers(token),
        )
        assert resp.status_code == 422

    def test_empty_body_rejected(self):
        token = _login("admin", "Admin1234")
        resp = client.patch(
            "/profile",
            json={},
            headers=_headers(token),
        )
        assert resp.status_code == 400

    def test_cannot_change_username(self):
        """Username field is not accepted by the schema."""
        token = _login("admin", "Admin1234")
        resp = client.patch(
            "/profile",
            json={"username": "hacked"},
            headers=_headers(token),
        )
        # The request either ignores the unknown field or returns 400 (no valid fields)
        if resp.status_code == 200:
            assert resp.json()["username"] == "admin"  # unchanged
        else:
            assert resp.status_code == 400

    def test_cannot_change_role(self):
        """Role field is not accepted by the schema."""
        token = _login("editor1", "Editor1234")
        resp = client.patch(
            "/profile",
            json={"role": "admin"},
            headers=_headers(token),
        )
        if resp.status_code == 200:
            assert resp.json()["role"] == "editor"  # unchanged
        else:
            assert resp.status_code == 400

    def test_profile_persists_across_requests(self):
        token = _login("admin", "Admin1234")
        client.patch(
            "/profile",
            json={"first_name": "Persisted"},
            headers=_headers(token),
        )
        resp = client.get("/profile", headers=_headers(token))
        assert resp.json()["first_name"] == "Persisted"


# ── POST /profile/change-password ─────────────────────────


class TestChangePassword:
    def test_change_password_success(self):
        token = _login("editor1", "Editor1234")
        resp = client.post(
            "/profile/change-password",
            json={"current_password": "Editor1234", "new_password": "NewEditor1234"},
            headers=_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json()["detail"] == "Password changed successfully"
        # Verify new password works
        new_token = _login("editor1", "NewEditor1234")
        assert new_token

    def test_wrong_current_password(self):
        token = _login("researcher1", "Research1234")
        resp = client.post(
            "/profile/change-password",
            json={"current_password": "WrongPass1", "new_password": "NewPass1234"},
            headers=_headers(token),
        )
        assert resp.status_code == 400
        assert "incorrect" in resp.json()["detail"].lower()

    def test_same_password_rejected(self):
        token = _login("admin", "Admin1234")
        resp = client.post(
            "/profile/change-password",
            json={"current_password": "Admin1234", "new_password": "Admin1234"},
            headers=_headers(token),
        )
        assert resp.status_code == 400
        assert "differ" in resp.json()["detail"].lower()

    def test_weak_password_too_short(self):
        token = _login("admin", "Admin1234")
        resp = client.post(
            "/profile/change-password",
            json={"current_password": "Admin1234", "new_password": "Ab1"},
            headers=_headers(token),
        )
        assert resp.status_code == 422

    def test_weak_password_no_uppercase(self):
        token = _login("admin", "Admin1234")
        resp = client.post(
            "/profile/change-password",
            json={"current_password": "Admin1234", "new_password": "alllower1"},
            headers=_headers(token),
        )
        assert resp.status_code == 422

    def test_weak_password_no_digit(self):
        token = _login("admin", "Admin1234")
        resp = client.post(
            "/profile/change-password",
            json={"current_password": "Admin1234", "new_password": "NoDigitsHere"},
            headers=_headers(token),
        )
        assert resp.status_code == 422

    def test_unauthenticated_returns_403(self):
        resp = client.post(
            "/profile/change-password",
            json={"current_password": "x", "new_password": "y"},
        )
        assert resp.status_code == 403


# ── Audit logging ─────────────────────────────────────────


class TestProfileAudit:
    def test_profile_update_creates_audit_event(self):
        token = _login("admin", "Admin1234")
        client.patch(
            "/profile",
            json={"first_name": "Audited"},
            headers=_headers(token),
        )
        resp = client.get("/audit", headers=_headers(token))
        assert resp.status_code == 200
        data = resp.json()
        actions = [e["action"] for e in data["items"]]
        assert "profile_updated" in actions

    def test_password_change_creates_audit_event(self):
        token = _login("admin", "Admin1234")
        client.post(
            "/profile/change-password",
            json={"current_password": "Admin1234", "new_password": "NewAdmin1234"},
            headers=_headers(token),
        )
        # Login with new password to get token for audit
        token = _login("admin", "NewAdmin1234")
        resp = client.get("/audit", headers=_headers(token))
        data = resp.json()
        actions = [e["action"] for e in data["items"]]
        assert "password_changed" in actions

    def test_failed_password_change_creates_audit_event(self):
        token = _login("admin", "Admin1234")
        client.post(
            "/profile/change-password",
            json={"current_password": "WrongPass1", "new_password": "Whatever1234"},
            headers=_headers(token),
        )
        resp = client.get("/audit", headers=_headers(token))
        data = resp.json()
        actions = [e["action"] for e in data["items"]]
        assert "password_change_failed" in actions
