import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from .database import engine, Base, SessionLocal
from .seed import seed_admin
from .routes.auth_routes import router as auth_router
from .routes.user_routes import router as user_router
from .routes.audit_routes import router as audit_router
from .routes.profile_routes import router as profile_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _run_migrations():
    """Add any missing columns to existing tables (safe, idempotent)."""
    migrations = [
        # ── users table ──
        ("users", "first_name", "VARCHAR(255)"),
        ("users", "last_name", "VARCHAR(255)"),
        ("users", "email", "VARCHAR(255)"),
        ("users", "profile_picture_url", "VARCHAR(1024)"),
        ("users", "updated_at", "TIMESTAMP WITH TIME ZONE DEFAULT NOW()"),
        # ── audit_events table ──
        ("audit_events", "source", "VARCHAR(50) NOT NULL DEFAULT 'auth'"),
        ("audit_events", "severity", "VARCHAR(20) NOT NULL DEFAULT 'info'"),
        ("audit_events", "actor_snapshot", "TEXT"),
        ("audit_events", "target_json", "TEXT"),
        ("audit_events", "request_context", "TEXT"),
    ]
    insp = inspect(engine)
    table_names = insp.get_table_names()

    with engine.begin() as conn:
        for table, column, col_type in migrations:
            if table not in table_names:
                continue  # table created fresh by create_all
            existing = {col["name"] for col in insp.get_columns(table)}
            if column not in existing:
                logger.info(f"Migration: adding column {table}.{column}")
                conn.execute(
                    text(f'ALTER TABLE {table} ADD COLUMN "{column}" {col_type}')
                )

        # ── indexes for audit_events ──
        if "audit_events" in table_names:
            existing_idx = {idx["name"] for idx in insp.get_indexes("audit_events")}
            index_defs = [
                ("ix_audit_events_created_at", "audit_events", "created_at DESC"),
                ("ix_audit_events_source", "audit_events", "source"),
                ("ix_audit_events_action", "audit_events", "action"),
                ("ix_audit_events_actor_user_id", "audit_events", "actor_user_id"),
            ]
            for idx_name, tbl, cols in index_defs:
                if idx_name not in existing_idx:
                    try:
                        conn.execute(
                            text(f"CREATE INDEX {idx_name} ON {tbl} ({cols})")
                        )
                        logger.info(f"Migration: created index {idx_name}")
                    except Exception:
                        pass  # index may already exist under different name


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Auth service starting up — creating tables...")
    Base.metadata.create_all(bind=engine)
    _run_migrations()
    db = SessionLocal()
    try:
        seed_admin(db)
    finally:
        db.close()
    yield


app = FastAPI(title="Auth Service", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(user_router)
app.include_router(audit_router)
app.include_router(profile_router)


@app.get("/health")
def health():
    return {"status": "ok"}
