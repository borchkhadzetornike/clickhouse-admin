"""Tests for audit log endpoints: pagination, sorting, filtering, detail view, redaction."""

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
    """Create tables and seed data before each test."""
    Base.metadata.create_all(bind=engine)
    db = TestSession()
    # Admin user
    db.add(
        User(
            username="admin",
            password_hash=hash_password("Admin1234"),
            role=RoleEnum.admin,
            is_active=True,
            first_name="Admin",
            last_name="User",
            email="admin@test.com",
        )
    )
    # Editor user
    db.add(
        User(
            username="editor1",
            password_hash=hash_password("Editor1234"),
            role=RoleEnum.editor,
            is_active=True,
        )
    )
    # Researcher user
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


def _generate_events(token: str):
    """Generate a few audit events by performing actions."""
    h = _headers(token)
    # Login events already generated from _login calls
    # Profile update
    client.patch("/profile", json={"first_name": "Updated"}, headers=h)
    # Create user
    client.post(
        "/users",
        json={"username": "testuser", "password": "Test1234", "role": "researcher"},
        headers=h,
    )
    # Failed login
    client.post("/login", json={"username": "admin", "password": "wrong"})


# ── Pagination Tests ──────────────────────────────────────


class TestAuditPagination:
    def test_default_pagination(self):
        token = _login("admin", "Admin1234")
        _generate_events(token)
        resp = client.get("/audit", headers=_headers(token))
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "page" in data
        assert "page_size" in data
        assert "total" in data
        assert data["page"] == 1
        assert data["page_size"] == 25

    def test_custom_page_size(self):
        token = _login("admin", "Admin1234")
        _generate_events(token)
        resp = client.get(
            "/audit", params={"page_size": 2}, headers=_headers(token)
        )
        data = resp.json()
        assert len(data["items"]) <= 2
        assert data["page_size"] == 2

    def test_page_navigation(self):
        token = _login("admin", "Admin1234")
        _generate_events(token)
        # Get first page
        resp1 = client.get(
            "/audit", params={"page": 1, "page_size": 2}, headers=_headers(token)
        )
        data1 = resp1.json()
        # Get second page
        resp2 = client.get(
            "/audit", params={"page": 2, "page_size": 2}, headers=_headers(token)
        )
        data2 = resp2.json()
        # Items should be different
        ids1 = {item["id"] for item in data1["items"]}
        ids2 = {item["id"] for item in data2["items"]}
        assert ids1.isdisjoint(ids2)


# ── Sorting Tests ─────────────────────────────────────────


class TestAuditSorting:
    def test_stable_sort_by_created_at_desc(self):
        token = _login("admin", "Admin1234")
        _generate_events(token)
        resp = client.get("/audit", headers=_headers(token))
        items = resp.json()["items"]
        # Verify descending order by created_at (and id for tiebreaking)
        for i in range(len(items) - 1):
            ts_a = items[i]["created_at"]
            ts_b = items[i + 1]["created_at"]
            assert ts_a >= ts_b


# ── Filtering Tests ───────────────────────────────────────


class TestAuditFiltering:
    def test_filter_by_action(self):
        token = _login("admin", "Admin1234")
        _generate_events(token)
        resp = client.get(
            "/audit",
            params={"action": "login_success"},
            headers=_headers(token),
        )
        data = resp.json()
        assert all(item["action"] == "login_success" for item in data["items"])

    def test_filter_by_severity(self):
        token = _login("admin", "Admin1234")
        _generate_events(token)
        resp = client.get(
            "/audit",
            params={"severity": "warn"},
            headers=_headers(token),
        )
        data = resp.json()
        assert all(item["severity"] == "warn" for item in data["items"])

    def test_filter_by_source(self):
        token = _login("admin", "Admin1234")
        _generate_events(token)
        resp = client.get(
            "/audit",
            params={"source": "auth"},
            headers=_headers(token),
        )
        data = resp.json()
        assert all(item["source"] == "auth" for item in data["items"])

    def test_search_query(self):
        token = _login("admin", "Admin1234")
        _generate_events(token)
        resp = client.get(
            "/audit",
            params={"q": "admin"},
            headers=_headers(token),
        )
        data = resp.json()
        assert data["total"] > 0


# ── Detail Endpoint Tests ─────────────────────────────────


class TestAuditDetail:
    def test_get_detail(self):
        token = _login("admin", "Admin1234")
        _generate_events(token)
        # Get list first
        list_resp = client.get("/audit", headers=_headers(token))
        items = list_resp.json()["items"]
        assert len(items) > 0
        event_id = items[0]["id"]
        # Get detail
        resp = client.get(f"/audit/{event_id}", headers=_headers(token))
        assert resp.status_code == 200
        detail = resp.json()
        assert detail["id"] == event_id
        assert "actor" in detail
        assert "source" in detail
        assert "action" in detail

    def test_detail_not_found(self):
        token = _login("admin", "Admin1234")
        resp = client.get("/audit/999999", headers=_headers(token))
        assert resp.status_code == 404

    def test_detail_contains_actor_snapshot(self):
        token = _login("admin", "Admin1234")
        # Trigger a profile update to get a rich event
        client.patch(
            "/profile",
            json={"first_name": "DetailTest"},
            headers=_headers(token),
        )
        list_resp = client.get(
            "/audit",
            params={"action": "profile_updated"},
            headers=_headers(token),
        )
        items = list_resp.json()["items"]
        assert len(items) > 0
        resp = client.get(f"/audit/{items[0]['id']}", headers=_headers(token))
        detail = resp.json()
        assert detail["actor_snapshot"] is not None
        assert detail["actor_snapshot"]["username"] == "admin"

    def test_detail_contains_metadata(self):
        token = _login("admin", "Admin1234")
        client.patch(
            "/profile",
            json={"first_name": "MetaTest"},
            headers=_headers(token),
        )
        list_resp = client.get(
            "/audit",
            params={"action": "profile_updated"},
            headers=_headers(token),
        )
        items = list_resp.json()["items"]
        resp = client.get(f"/audit/{items[0]['id']}", headers=_headers(token))
        detail = resp.json()
        assert detail["metadata"] is not None
        assert "first_name" in detail["metadata"]


# ── Actor Display Tests ───────────────────────────────────


class TestAuditActorDisplay:
    def test_actor_shows_username_and_role(self):
        token = _login("admin", "Admin1234")
        resp = client.get("/audit", headers=_headers(token))
        items = resp.json()["items"]
        for item in items:
            actor = item["actor"]
            assert "username" in actor
            assert actor["username"] != ""
            # Events with actors should have roles
            if actor["id"] is not None:
                assert actor["role"] is not None

    def test_actor_display_name_uses_real_name(self):
        token = _login("admin", "Admin1234")
        resp = client.get(
            "/audit",
            params={"action": "login_success"},
            headers=_headers(token),
        )
        items = resp.json()["items"]
        # Admin has first_name="Admin", last_name="User"
        admin_events = [i for i in items if i["actor"]["username"] == "admin"]
        if admin_events:
            assert admin_events[0]["actor"]["display_name"] == "Admin User"


# ── Summary Tests ─────────────────────────────────────────


class TestAuditSummary:
    def test_profile_update_summary_lists_fields(self):
        token = _login("admin", "Admin1234")
        client.patch(
            "/profile",
            json={"first_name": "SummaryTest", "email": "summary@test.com"},
            headers=_headers(token),
        )
        resp = client.get(
            "/audit",
            params={"action": "profile_updated"},
            headers=_headers(token),
        )
        items = resp.json()["items"]
        assert len(items) > 0
        summary = items[0]["summary"]
        assert "first_name" in summary
        assert "email" in summary

    def test_login_success_summary(self):
        token = _login("admin", "Admin1234")
        resp = client.get(
            "/audit",
            params={"action": "login_success"},
            headers=_headers(token),
        )
        items = resp.json()["items"]
        assert any("admin" in item["summary"].lower() for item in items)


# ── Security / Redaction Tests ────────────────────────────


class TestAuditSecurity:
    def test_password_not_in_metadata(self):
        """Passwords must never be stored in audit metadata."""
        token = _login("admin", "Admin1234")
        # Reset another user's password via admin endpoint
        # First create user
        client.post(
            "/users",
            json={"username": "pwuser", "password": "Test1234", "role": "researcher"},
            headers=_headers(token),
        )
        client.patch(
            "/users/4",
            json={"password": "NewSecret99"},
            headers=_headers(token),
        )
        resp = client.get("/audit", headers=_headers(token))
        for item in resp.json()["items"]:
            summary = item.get("summary", "")
            preview = str(item.get("metadata_preview", ""))
            assert "NewSecret99" not in summary
            assert "NewSecret99" not in preview
            assert "Test1234" not in summary
            assert "Test1234" not in preview

    def test_researcher_can_access_audit(self):
        """Researchers should be able to read the audit log."""
        # Generate some events first
        admin_token = _login("admin", "Admin1234")
        _generate_events(admin_token)
        token = _login("researcher1", "Research1234")
        resp = client.get("/audit", headers=_headers(token))
        assert resp.status_code == 200

    def test_editor_cannot_access_audit(self):
        """Editors should not be able to read the audit log."""
        token = _login("editor1", "Editor1234")
        resp = client.get("/audit", headers=_headers(token))
        assert resp.status_code == 403
