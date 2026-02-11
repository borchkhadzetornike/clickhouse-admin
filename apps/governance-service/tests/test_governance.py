"""Minimal tests for governance-service: JWT auth, proposals, connection test."""


def test_jwt_auth_required(api):
    resp = api.get("/clusters")
    assert resp.status_code == 403


def test_create_cluster(api, admin_headers):
    resp = api.post(
        "/clusters",
        json={
            "name": "test-ch",
            "host": "localhost",
            "port": 8123,
            "protocol": "http",
            "username": "default",
            "password": "",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "test-ch"
    assert "password" not in data


def test_create_cluster_editor_forbidden(api, editor_headers):
    resp = api.post(
        "/clusters",
        json={
            "name": "test",
            "host": "localhost",
            "port": 8123,
            "protocol": "http",
            "username": "default",
            "password": "",
        },
        headers=editor_headers,
    )
    assert resp.status_code == 403


def test_create_proposal_returns_sql_preview(api, admin_headers):
    api.post(
        "/clusters",
        json={
            "name": "prop-ch",
            "host": "localhost",
            "port": 8123,
            "protocol": "http",
            "username": "default",
            "password": "",
        },
        headers=admin_headers,
    )
    clusters = api.get("/clusters", headers=admin_headers).json()
    cluster_id = clusters[0]["id"]

    resp = api.post(
        "/proposals/legacy",
        json={
            "cluster_id": cluster_id,
            "proposal_type": "grant_select",
            "db": "analytics",
            "table": "events",
            "target_type": "user",
            "target_name": "readonly_user",
            "reason": "Need read access for reporting",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "sql_preview" in data
    assert "GRANT SELECT" in data["sql_preview"]
    assert data["status"] == "submitted"


def test_researcher_read_only(api, researcher_headers, admin_headers):
    resp = api.get("/clusters", headers=researcher_headers)
    assert resp.status_code == 200

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
        headers=researcher_headers,
    )
    assert resp.status_code == 403

    resp = api.post(
        "/proposals",
        json={
            "cluster_id": 1,
            "proposal_type": "grant_select",
            "db": "d",
            "table": "t",
            "target_type": "user",
            "target_name": "u",
        },
        headers=researcher_headers,
    )
    assert resp.status_code == 403
