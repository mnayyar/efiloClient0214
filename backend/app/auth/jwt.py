"""JWT token management using PyJWT (HS256).

Cross-compatible with the existing Next.js jose-based tokens:
same secret (WORKOS_CLIENT_ID), same algorithm (HS256), same claims.
"""

from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Request, Response

from app.config import get_settings

SESSION_COOKIE = "efilo_session"
SESSION_EXPIRY = timedelta(days=7)


def create_session_token(user_id: str, email: str, role: str) -> str:
    """Create a signed JWT session token."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "userId": user_id,
        "email": email,
        "role": role,
        "iat": now,
        "exp": now + SESSION_EXPIRY,
    }
    return jwt.encode(payload, settings.workos_client_id, algorithm="HS256")


def verify_session_token(token: str) -> dict | None:
    """Verify and decode a JWT session token. Returns claims or None."""
    settings = get_settings()
    try:
        return jwt.decode(token, settings.workos_client_id, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


def set_session_cookie(response: Response, token: str) -> None:
    """Set the httpOnly session cookie on a response."""
    settings = get_settings()
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        secure=not settings.is_development,
        samesite="lax",
        path="/",
        max_age=int(SESSION_EXPIRY.total_seconds()),
    )


def clear_session_cookie(response: Response) -> None:
    """Delete the session cookie."""
    response.delete_cookie(key=SESSION_COOKIE, path="/")


def get_session_from_request(request: Request) -> dict | None:
    """Extract and verify the session from the request cookie."""
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    return verify_session_token(token)
