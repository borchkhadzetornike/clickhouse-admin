-- ============================================================
-- Demo ClickHouse bootstrap: Database & Tables
-- Runs on first container startup via /docker-entrypoint-initdb.d
-- DEV / DEMO ONLY — not for production use
-- ============================================================

-- Idempotent: CREATE IF NOT EXISTS

CREATE DATABASE IF NOT EXISTS analytics;

-- ── analytics.sales ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics.sales
(
    id          UInt64,
    sale_date   Date,
    customer_id UInt32,
    product     String,
    quantity    UInt32,
    amount      Decimal(12, 2),
    region      LowCardinality(String)
)
ENGINE = MergeTree()
ORDER BY (sale_date, id);

-- ── analytics.users ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics.users
(
    id            UInt64,
    username      String,
    email         String,
    created_at    DateTime DEFAULT now(),
    is_active     UInt8 DEFAULT 1,
    department    LowCardinality(String)
)
ENGINE = MergeTree()
ORDER BY (id);

-- ── Seed a few sample rows so the tables aren't empty ───────
INSERT INTO analytics.sales (id, sale_date, customer_id, product, quantity, amount, region)
VALUES
    (1, '2025-01-15', 101, 'Widget A',  10, 199.90,  'US-East'),
    (2, '2025-01-16', 102, 'Widget B',   5, 74.50,   'EU-West'),
    (3, '2025-02-01', 103, 'Gadget C',   2, 540.00,  'APAC'),
    (4, '2025-02-14', 101, 'Widget A',  20, 399.80,  'US-East'),
    (5, '2025-03-10', 104, 'Service D',  1, 1200.00, 'US-West');

INSERT INTO analytics.users (id, username, email, department)
VALUES
    (1, 'alice',   'alice@example.com',   'Engineering'),
    (2, 'bob',     'bob@example.com',     'Marketing'),
    (3, 'charlie', 'charlie@example.com', 'Analytics'),
    (4, 'diana',   'diana@example.com',   'Engineering');
