# ClickHouse Access Governance — MVP

A microservices-based application for managing ClickHouse access through a proposal-based governance workflow. This MVP provides SQL preview and approval workflows **without** executing any GRANT/REVOKE statements against ClickHouse.

## Architecture

```
┌─────────┐      ┌──────────────┐      ┌─────────────────────┐
│   UI    │─────▶│  auth-service │      │  postgres-auth      │
│ (React) │      │  (FastAPI)   │─────▶│  (users, audit)     │
│         │      └──────────────┘      └─────────────────────┘
│         │
│         │      ┌──────────────────┐  ┌─────────────────────┐
│         │─────▶│governance-service│  │ postgres-governance  │
│         │      │   (FastAPI)      │─▶│ (clusters, proposals│
└─────────┘      │                  │  │  audit)             │
                 │                  │  └─────────────────────┘
                 │                  │
                 │                  │──▶ ClickHouse (read-only
                 └──────────────────┘    metadata queries)
```

| Service              | Port  | Description                              |
|----------------------|-------|------------------------------------------|
| UI                   | 3000  | React SPA served by nginx (Docker) or Vite (dev) |
| auth-service         | 4000  | Authentication, users, app RBAC          |
| governance-service   | 4001  | Clusters, explorer, proposals, audit     |
| postgres-auth        | 5432  | Auth service database                    |
| postgres-governance  | 5433  | Governance service database              |

## Quick Start (Docker Compose)

```bash
docker compose up --build
```

Then open **http://localhost:3000** in your browser.

### Default Admin Credentials

| Field    | Value   |
|----------|---------|
| Username | `admin` |
| Password | `admin` |

> **Warning**: Change the default admin password immediately in production.

## App Roles (RBAC)

| Role       | Capabilities                                          |
|------------|-------------------------------------------------------|
| admin      | Manage users/roles, create clusters, create/approve proposals |
| editor     | Create proposals                                       |
| researcher | Read-only: view clusters, explorer, proposals, audit  |

**No self-registration** — users can only be created by an admin.

## End-to-End Walkthrough

### 1. Login

Go to http://localhost:3000, sign in with `admin` / `admin`.

### 2. Add a ClickHouse Cluster

Navigate to **Clusters** → **Add Cluster**. Fill in:
- **Name**: e.g. `production`
- **Host**: your ClickHouse host (e.g. `host.docker.internal` for local CH)
- **Port**: `8123` (HTTP) or `9000` (native)
- **Protocol**: `http`
- **Username/Password**: ClickHouse credentials

Click **Create Cluster**, then **Test Connection** to verify connectivity.

### 3. Browse Databases and Tables

Navigate to **Explorer**. Select a cluster → databases load → select a database → tables load → select a table → columns load.

### 4. Create a Proposal

Navigate to **Proposals** → **New Proposal**:
1. Select cluster, database, table
2. Choose target type (user/role) and enter the ClickHouse user or role name
3. Optionally add a reason
4. Click **Create Proposal**

The SQL preview (e.g. `GRANT SELECT ON db.table TO user`) is generated and stored.

### 5. Approve a Proposal (Admin Only)

Click a proposal in the list → view details and SQL preview → click **Approve** or **Reject**.

### 6. Confirm Execute is Disabled

The **Execute** button is visible but **permanently disabled** in this MVP. The backend returns `501 Not Implemented` for any execute attempt.

### 7. View Audit Log

Navigate to **Audit** to see all actions: logins, user changes, cluster operations, proposal workflows. Filter by source (Auth / Governance).

## Demo ClickHouse Instance (Dev / Demo Only)

A separate Docker Compose file provides a self-contained ClickHouse instance
pre-loaded with demo users, roles, a sample database, and seed data. Use it
to test the governance/auth app locally **without connecting to a real cluster**.

### Start the Demo Instance

```bash
docker compose -f docker-compose.clickhouse.yml up -d
```

Wait for the healthcheck to pass (≈ 15–20 s on first run), then verify:

```bash
docker compose -f docker-compose.clickhouse.yml ps
# STATUS should show "healthy"
```

### Stop / Reset

```bash
# Stop (data preserved)
docker compose -f docker-compose.clickhouse.yml down

# Stop and destroy all data
docker compose -f docker-compose.clickhouse.yml down -v
rm -rf ./dev-data/clickhouse
```

### Connection Details

| Parameter  | Value                |
|------------|----------------------|
| Host       | `localhost` (from host) or `clickhouse-demo` (from Docker network) |
| HTTP port  | `8123`               |
| Native port| `9000`               |
| Default user | `default`          |
| Default password | `clickhouse`   |

### Demo Users & Credentials

| User          | Password           | Default Role     | Privileges                        |
|---------------|--------------------|------------------|-----------------------------------|
| `demo_admin`  | `demo_admin_pass`  | `analytics_rw`   | SELECT + INSERT on `analytics.*`  |
| `demo_reader` | `demo_reader_pass` | `analytics_ro`   | SELECT on `analytics.*`           |

### Demo Roles

| Role           | Grants                             |
|----------------|------------------------------------|
| `analytics_ro` | SELECT on `analytics.*`            |
| `analytics_rw` | SELECT + INSERT on `analytics.*`   |

### Demo Database & Tables

| Table             | Description                       |
|-------------------|-----------------------------------|
| `analytics.sales` | Sample sales transactions (5 rows)|
| `analytics.users` | Sample user records (4 rows)      |

### Adding the Cluster in the Governance UI

Once both stacks are running you can register the demo instance as a cluster:

1. Start the main stack: `docker compose up --build`
2. Start the demo ClickHouse: `docker compose -f docker-compose.clickhouse.yml up -d`
3. Login to the UI at http://localhost:3000 (`admin` / `admin`)
4. Navigate to **Clusters** → **Add Cluster** and fill in:
   - **Name**: `demo`
   - **Host**: `host.docker.internal` (resolves to the Docker host)
   - **Port**: `8123`
   - **Protocol**: `http`
   - **Username**: `default`
   - **Password**: `clickhouse`
5. Click **Test Connection** — it should succeed.

> **Networking note**: The demo ClickHouse runs on its own Docker network.
> Main-stack services reach it via `host.docker.internal` (macOS / Windows)
> which resolves to the host machine where port 8123 is published. On Linux
> you may need to add `--add-host=host.docker.internal:host-gateway` to your
> main-stack services, or connect both stacks to a shared Docker network.

---

## Local Development (Without Docker)

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL 16+ (two databases)

### Auth Service

```bash
cd apps/auth-service
pip install -r requirements.txt
export DATABASE_URL=postgresql://auth_user:auth_pass@localhost:5432/auth_db
export JWT_SECRET=dev-secret
uvicorn app.main:app --port 4000 --reload
```

### Governance Service

```bash
cd apps/governance-service
pip install -r requirements.txt
export DATABASE_URL=postgresql://gov_user:gov_pass@localhost:5433/governance_db
export JWT_SECRET=dev-secret
export ENCRYPTION_KEY=0123456789abcdef0123456789abcdef
uvicorn app.main:app --port 4001 --reload
```

### UI

```bash
cd apps/ui
npm install
npm run dev
```

Vite dev server at http://localhost:3000 proxies API calls to the backend services.

## Running Tests

```bash
# Auth service tests
cd apps/auth-service
pip install pytest
pytest tests/ -v

# Governance service tests
cd apps/governance-service
pip install pytest
pytest tests/ -v
```

## Environment Variables

| Variable              | Default                              | Description                      |
|-----------------------|--------------------------------------|----------------------------------|
| `JWT_SECRET`          | `super-secret-jwt-key-change-in-production` | Shared JWT signing key     |
| `JWT_EXPIRATION_MINUTES` | `60`                              | Token TTL in minutes             |
| `DATABASE_URL`        | (per service)                        | PostgreSQL connection string     |
| `ENCRYPTION_KEY`      | `0123456789abcdef0123456789abcdef`   | AES-128-GCM key (32 hex chars)  |

## Key Design Decisions

- **No execution in MVP**: GRANT/REVOKE SQL is generated for preview only. The execute endpoint always returns 501.
- **Shared JWT secret**: Both services use the same `JWT_SECRET` for token validation (HMAC-SHA256).
- **Password encryption**: ClickHouse cluster passwords are encrypted at rest using AES-128-GCM.
- **Auto-seeding**: Default admin user is created on first boot when the users table is empty.
- **No API gateway**: The nginx in the UI container (or Vite proxy in dev) routes `/api/auth/*` and `/api/gov/*` to the appropriate services.

## Project Structure

```
clickhouse-admin/
├── docker-compose.yml
├── docker-compose.clickhouse.yml   # Demo ClickHouse (dev only)
├── dev/
│   └── clickhouse/
│       └── init/                   # Bootstrap SQL scripts
│           ├── 01_create_database_and_tables.sql
│           └── 02_create_roles_and_users.sql
├── .env.example
├── README.md
├── apps/
│   ├── auth-service/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── app/
│   │   │   ├── main.py
│   │   │   ├── config.py
│   │   │   ├── database.py
│   │   │   ├── models.py
│   │   │   ├── schemas.py
│   │   │   ├── auth.py
│   │   │   ├── seed.py
│   │   │   └── routes/
│   │   └── tests/
│   ├── governance-service/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── app/
│   │   │   ├── main.py
│   │   │   ├── config.py
│   │   │   ├── database.py
│   │   │   ├── models.py
│   │   │   ├── schemas.py
│   │   │   ├── auth.py
│   │   │   ├── encryption.py
│   │   │   ├── clickhouse_client.py
│   │   │   └── routes/
│   │   └── tests/
│   └── ui/
│       ├── Dockerfile
│       ├── nginx.conf
│       ├── package.json
│       ├── vite.config.ts
│       └── src/
│           ├── App.tsx
│           ├── api/
│           ├── components/
│           ├── contexts/
│           └── pages/
```
