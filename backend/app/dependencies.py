"""Shared FastAPI dependencies."""

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import get_session_from_request
from app.auth.rate_limit import rate_limit_general
from app.db.session import get_db
from app.models.user import User


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extract and validate the current user from the session cookie.

    Usage in routes:
        @router.get("/something")
        async def handler(user: User = Depends(get_current_user)):
            ...
    """
    session = get_session_from_request(request)
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_id = session.get("userId")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # General rate limit (1000 req/hr)
    if not rate_limit_general.check(user_id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    return user


__all__ = ["get_db", "get_current_user"]
