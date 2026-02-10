import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://gov_user:gov_pass@localhost:5433/governance_db",
)
JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-jwt-key-change-in-production")
JWT_ALGORITHM = "HS256"

# 32 hex chars = 16 bytes (AES-128-GCM key)
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef")

# ── Phase 3: Executor-service integration ─────────────
EXECUTOR_URL = os.getenv("EXECUTOR_URL", "http://executor-service:4002")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "change-me-internal-key")
