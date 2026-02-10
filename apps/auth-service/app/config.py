import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://auth_user:auth_pass@localhost:5432/auth_db",
)
JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-jwt-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_MINUTES = int(os.getenv("JWT_EXPIRATION_MINUTES", "60"))
DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_PASSWORD = "admin"
