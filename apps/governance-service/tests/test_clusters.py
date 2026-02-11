"""Tests for the cluster connection management endpoints:
validate, create, update, delete, test, diagnostics."""

from app.models import Cluster


def _create_cluster(api, headers, name="test-ch", host="localhost", port=8123):
    """Helper to create a cluster via the API."""
    resp = api.post(
        "/clusters",
        json={
            "name": name,
            "host": host,
            "port": port,
            "protocol": "http",
            "username": "default",
            "password": "testpass",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()


# ── Create ────────────────────────────────────────────────


def test_create_cluster_returns_status_never_tested(api, admin_headers):
    data = _create_cluster(api, admin_headers)
    assert data["status"] == "never_tested"
    assert data["last_tested_at"] is None
    assert data["latency_ms"] is None
    assert data["server_version"] is None


def test_create_cluster_duplicate_name(api, admin_headers):
    _create_cluster(api, admin_headers, name="dup")
    resp = api.post(
        "/clusters",
        json={
            "name": "dup",
            "host": "other",
            "port": 8123,
            "protocol": "http",
            "username": "default",
            "password": "pass",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 409


def test_create_cluster_non_admin_forbidden(api, editor_headers):
    resp = api.post(
        "/clusters",
        json={
            "name": "test",
            "host": "h",
            "port": 8123,
            "protocol": "http",
            "username": "u",
            "password": "p",
        },
        headers=editor_headers,
    )
    assert resp.status_code == 403


def test_create_cluster_password_not_in_response(api, admin_headers):
    data = _create_cluster(api, admin_headers)
    assert "password" not in data
    assert "password_encrypted" not in data


# ── List ──────────────────────────────────────────────────


def test_list_clusters(api, admin_headers):
    _create_cluster(api, admin_headers, name="c1")
    _create_cluster(api, admin_headers, name="c2")
    resp = api.get("/clusters", headers=admin_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_list_clusters_excludes_deleted(api, admin_headers):
    data = _create_cluster(api, admin_headers, name="to-delete")
    api.delete(f"/clusters/{data['id']}", headers=admin_headers)
    resp = api.get("/clusters", headers=admin_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 0


# ── Update ────────────────────────────────────────────────


def test_update_cluster_name(api, admin_headers):
    data = _create_cluster(api, admin_headers)
    resp = api.patch(
        f"/clusters/{data['id']}",
        json={"name": "renamed"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "renamed"


def test_update_cluster_name_conflict(api, admin_headers):
    _create_cluster(api, admin_headers, name="a")
    b = _create_cluster(api, admin_headers, name="b")
    resp = api.patch(
        f"/clusters/{b['id']}",
        json={"name": "a"},
        headers=admin_headers,
    )
    assert resp.status_code == 409


def test_update_host_resets_status(api, admin_headers, db_session):
    data = _create_cluster(api, admin_headers)
    cluster = db_session.query(Cluster).filter(Cluster.id == data["id"]).first()
    cluster.status = "healthy"
    cluster.server_version = "24.1.0"
    cluster.latency_ms = 50
    db_session.commit()

    resp = api.patch(
        f"/clusters/{data['id']}",
        json={"host": "new-host"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["status"] == "never_tested"
    assert updated["server_version"] is None
    assert updated["latency_ms"] is None


def test_update_password_resets_status(api, admin_headers, db_session):
    data = _create_cluster(api, admin_headers)
    cluster = db_session.query(Cluster).filter(Cluster.id == data["id"]).first()
    cluster.status = "healthy"
    db_session.commit()

    resp = api.patch(
        f"/clusters/{data['id']}",
        json={"password": "newpass123"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "never_tested"


def test_update_non_admin_forbidden(api, admin_headers, editor_headers):
    data = _create_cluster(api, admin_headers)
    resp = api.patch(
        f"/clusters/{data['id']}",
        json={"name": "x"},
        headers=editor_headers,
    )
    assert resp.status_code == 403


def test_update_nonexistent_cluster(api, admin_headers):
    resp = api.patch(
        "/clusters/999",
        json={"name": "x"},
        headers=admin_headers,
    )
    assert resp.status_code == 404


# ── Delete ────────────────────────────────────────────────


def test_delete_cluster(api, admin_headers):
    data = _create_cluster(api, admin_headers)
    resp = api.delete(f"/clusters/{data['id']}", headers=admin_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True


def test_delete_cluster_non_admin_forbidden(api, admin_headers, editor_headers):
    data = _create_cluster(api, admin_headers)
    resp = api.delete(f"/clusters/{data['id']}", headers=editor_headers)
    assert resp.status_code == 403


def test_delete_nonexistent_cluster(api, admin_headers):
    resp = api.delete("/clusters/999", headers=admin_headers)
    assert resp.status_code == 404


def test_delete_already_deleted(api, admin_headers):
    data = _create_cluster(api, admin_headers)
    api.delete(f"/clusters/{data['id']}", headers=admin_headers)
    resp = api.delete(f"/clusters/{data['id']}", headers=admin_headers)
    assert resp.status_code == 404


# ── Diagnostics ───────────────────────────────────────────


def test_diagnostics_returns_full_info(api, admin_headers):
    data = _create_cluster(api, admin_headers)
    resp = api.get(f"/clusters/{data['id']}/diagnostics", headers=admin_headers)
    assert resp.status_code == 200
    diag = resp.json()
    assert diag["name"] == "test-ch"
    assert diag["status"] == "never_tested"
    assert "dependency_count" in diag
    assert diag["dependency_count"] == 0


def test_diagnostics_non_admin_forbidden(api, admin_headers, editor_headers):
    data = _create_cluster(api, admin_headers)
    resp = api.get(f"/clusters/{data['id']}/diagnostics", headers=editor_headers)
    assert resp.status_code == 403


def test_diagnostics_nonexistent(api, admin_headers):
    resp = api.get("/clusters/999/diagnostics", headers=admin_headers)
    assert resp.status_code == 404


# ── Validate (unsaved) ───────────────────────────────────


def test_validate_non_admin_forbidden(api, editor_headers):
    resp = api.post(
        "/clusters/validate",
        json={
            "host": "localhost",
            "port": 8123,
            "protocol": "http",
            "username": "default",
            "password": "pass",
        },
        headers=editor_headers,
    )
    assert resp.status_code == 403


def test_validate_bad_host_returns_error(api, admin_headers):
    resp = api.post(
        "/clusters/validate",
        json={
            "host": "this-host-definitely-does-not-exist.invalid",
            "port": 9999,
            "protocol": "http",
            "username": "x",
            "password": "x",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert body["error_code"] is not None
    assert len(body.get("suggestions", [])) > 0


# ── Test (saved cluster) ─────────────────────────────────


def test_test_saved_cluster_bad_host(api, admin_headers):
    data = _create_cluster(api, admin_headers, host="unreachable.invalid", port=9999)
    resp = api.post(f"/clusters/{data['id']}/test", headers=admin_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert body["error_code"] is not None

    listing = api.get("/clusters", headers=admin_headers).json()
    cluster = next(c for c in listing if c["id"] == data["id"])
    assert cluster["status"] == "failed"
    assert cluster["error_code"] is not None
    assert cluster["last_tested_at"] is not None


def test_test_nonexistent_cluster(api, admin_headers):
    resp = api.post("/clusters/999/test", headers=admin_headers)
    assert resp.status_code == 404


def test_test_non_admin_forbidden(api, admin_headers, editor_headers):
    data = _create_cluster(api, admin_headers)
    resp = api.post(f"/clusters/{data['id']}/test", headers=editor_headers)
    assert resp.status_code == 403


# ── Security: no secrets leaked ──────────────────────────


def test_no_password_in_list(api, admin_headers):
    _create_cluster(api, admin_headers)
    resp = api.get("/clusters", headers=admin_headers)
    for c in resp.json():
        assert "password" not in c
        assert "password_encrypted" not in c


def test_no_password_in_diagnostics(api, admin_headers):
    data = _create_cluster(api, admin_headers)
    resp = api.get(f"/clusters/{data['id']}/diagnostics", headers=admin_headers)
    diag = resp.json()
    assert "password" not in diag
    assert "password_encrypted" not in diag
