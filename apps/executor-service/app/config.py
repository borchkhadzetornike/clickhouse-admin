import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://exec_user:exec_pass@postgres-executor:5432/executor_db",
)
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "change-me-internal-key")
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef")
