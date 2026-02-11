-- ============================================================
-- Demo ClickHouse bootstrap: Roles, Users & Grants
-- Runs on first container startup via /docker-entrypoint-initdb.d
-- DEV / DEMO ONLY — not for production use
-- ============================================================

-- ── Roles ───────────────────────────────────────────────────
CREATE ROLE IF NOT EXISTS analytics_ro;
CREATE ROLE IF NOT EXISTS analytics_rw;

-- ── Grant privileges to roles ───────────────────────────────
GRANT SELECT ON analytics.* TO analytics_ro;
GRANT SELECT, INSERT ON analytics.* TO analytics_rw;

-- ── Demo users ──────────────────────────────────────────────
-- Passwords are intentionally simple — this is dev/demo only.
CREATE USER IF NOT EXISTS demo_reader
    IDENTIFIED BY 'demo_reader_pass'
    DEFAULT ROLE analytics_ro;

CREATE USER IF NOT EXISTS demo_admin
    IDENTIFIED BY 'demo_admin_pass'
    DEFAULT ROLE analytics_rw;

-- ── Assign roles to users ───────────────────────────────────
GRANT analytics_ro TO demo_reader;
GRANT analytics_rw TO demo_admin;
