import logging

from sqlalchemy.orm import Session

from .models import User, RoleEnum
from .auth import hash_password, verify_password
from .config import DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD

logger = logging.getLogger(__name__)


def seed_admin(db: Session):
    """Seed default admin user if and only if users table is empty."""
    count = db.query(User).count()
    if count == 0:
        logger.info("No users found. Seeding default admin user.")
        admin = User(
            username=DEFAULT_ADMIN_USERNAME,
            password_hash=hash_password(DEFAULT_ADMIN_PASSWORD),
            role=RoleEnum.admin,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        logger.warning(
            "Default admin user created with password 'admin'. "
            "Change it immediately in production!"
        )
    else:
        # Warn if default admin password is still 'admin'
        admin = (
            db.query(User)
            .filter(User.username == DEFAULT_ADMIN_USERNAME)
            .first()
        )
        if admin and verify_password(DEFAULT_ADMIN_PASSWORD, admin.password_hash):
            logger.warning(
                "Default admin password is still 'admin'. "
                "Change it immediately!"
            )
