"""Development bypass authentication.

When ENVIRONMENT=development and no real WorkOS key is configured,
auto-login as the seed dev user without any IdP interaction.
"""

from datetime import datetime, timezone

from sqlalchemy import select

from app.config import get_settings
from app.db.session import async_session_factory
from app.models.enums import AuthMethod, UserRole
from app.models.organization import Organization
from app.models.user import User

settings = get_settings()

IS_DEV_BYPASS = settings.is_development and (
    not settings.workos_api_key
    or settings.workos_api_key == "sk_live_..."
    or settings.workos_api_key.startswith("sk_test_")
)


async def dev_login() -> User:
    """Create or fetch the dev user, update lastLoginAt, return User."""
    async with async_session_factory() as session:
        # Ensure at least one Organization exists
        result = await session.execute(select(Organization).limit(1))
        org = result.scalar_one_or_none()
        if not org:
            org = Organization(
                name="Dev Organization",
                slug="dev",
                billing_email="dev@efilo.ai",
            )
            session.add(org)
            await session.flush()

        # Ensure dev user exists
        result = await session.execute(
            select(User).where(User.email == "mnayyar@efilo.ai")
        )
        user = result.scalar_one_or_none()
        if not user:
            user = User(
                email="mnayyar@efilo.ai",
                name="Mateen Nayyar",
                role=UserRole.ADMIN,
                auth_method=AuthMethod.EMAIL_PASSWORD,
                organization_id=org.id,
            )
            session.add(user)
        else:
            user.last_login_at = datetime.utcnow()

        await session.commit()
        await session.refresh(user)
        return user
