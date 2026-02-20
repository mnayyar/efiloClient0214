"""Auth API routes.

Endpoints:
  POST /api/auth/login      — Email/password login
  GET  /api/auth/sso        — Initiate SSO (or dev bypass)
  GET  /api/auth/callback/workos — WorkOS OAuth callback
  POST /api/auth/logout     — Clear session
  GET  /api/auth/user       — Get current user
"""

from datetime import datetime, timezone
from urllib.parse import urlencode

import bcrypt
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dev_auth import IS_DEV_BYPASS, dev_login
from app.auth.jwt import (
    clear_session_cookie,
    create_session_token,
    get_session_from_request,
    set_session_cookie,
)
from app.config import get_settings
from app.db.session import get_db
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    avatar: str | None = None


# ---------------------------------------------------------------------------
# POST /api/auth/login
# ---------------------------------------------------------------------------

@router.post("/login")
async def login(
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate with email and password."""
    # Find user by email (case-insensitive)
    result = await db.execute(
        select(User).where(func.lower(User.email) == body.email.lower())
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Must be EMAIL_PASSWORD auth method
    if user.auth_method.value != "EMAIL_PASSWORD" or not user.password_hash:
        raise HTTPException(
            status_code=401,
            detail="This account uses SSO. Please use the SSO login button.",
        )

    # Verify password
    if not bcrypt.checkpw(body.password.encode(), user.password_hash.encode()):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Update last login
    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()

    # Create session
    token = create_session_token(user.id, user.email, user.role.value)
    set_session_cookie(response, token)

    return {"data": {"success": True}}


# ---------------------------------------------------------------------------
# GET /api/auth/sso
# ---------------------------------------------------------------------------

@router.get("/sso")
async def sso_redirect():
    """Redirect to WorkOS SSO authorization, or dev bypass."""
    settings = get_settings()

    # Dev bypass — auto-login as seed user
    if IS_DEV_BYPASS:
        user = await dev_login()
        token = create_session_token(user.id, user.email, user.role.value)
        resp = RedirectResponse(url="/projects", status_code=302)
        set_session_cookie(resp, token)
        return resp

    # Build WorkOS authorization URL
    params = urlencode({
        "client_id": settings.workos_client_id,
        "redirect_uri": settings.workos_redirect_uri,
        "response_type": "code",
        "organization_id": settings.workos_organization_id,
    })
    auth_url = f"https://api.workos.com/sso/authorize?{params}"
    return RedirectResponse(url=auth_url, status_code=302)


# ---------------------------------------------------------------------------
# GET /api/auth/callback/workos
# ---------------------------------------------------------------------------

@router.get("/callback/workos")
async def workos_callback(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle WorkOS OAuth callback — exchange code for user profile."""
    settings = get_settings()

    error = request.query_params.get("error")
    error_description = request.query_params.get("error_description", "")
    code = request.query_params.get("code")

    # Handle IdP errors
    if error:
        error_type = (
            "not_authorized"
            if "not configured" in error_description.lower()
            else "auth_failed"
        )
        return RedirectResponse(url=f"/login?error={error_type}", status_code=302)

    if not code:
        return RedirectResponse(url="/login?error=missing_code", status_code=302)

    try:
        # Exchange authorization code for user profile
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.workos.com/user_management/authenticate",
                json={
                    "client_id": settings.workos_client_id,
                    "client_secret": settings.workos_api_key,
                    "grant_type": "authorization_code",
                    "code": code,
                },
            )
            resp.raise_for_status()
            workos_data = resp.json()

        # Extract user info
        workos_user = workos_data.get("user", workos_data)
        workos_email = workos_user.get("email", "").lower()
        workos_id = workos_user.get("id", "")
        first_name = workos_user.get("first_name", "")
        last_name = workos_user.get("last_name", "")
        full_name = f"{first_name} {last_name}".strip() or workos_email

        # Find existing user by email (must be pre-approved)
        result = await db.execute(
            select(User).where(func.lower(User.email) == workos_email)
        )
        user = result.scalar_one_or_none()

        if not user:
            return RedirectResponse(url="/login?error=not_authorized", status_code=302)

        # Update user with WorkOS info
        user.workos_user_id = workos_id
        if full_name:
            user.name = full_name
        user.last_login_at = datetime.now(timezone.utc)
        await db.commit()

        # Create session
        token = create_session_token(user.id, user.email, user.role.value)
        redirect = RedirectResponse(url="/projects", status_code=302)
        set_session_cookie(redirect, token)
        return redirect

    except Exception:
        return RedirectResponse(url="/login?error=auth_failed", status_code=302)


# ---------------------------------------------------------------------------
# POST /api/auth/logout
# ---------------------------------------------------------------------------

@router.post("/logout")
async def logout(response: Response):
    """Clear the session cookie."""
    clear_session_cookie(response)
    return {"data": {"success": True}}


# ---------------------------------------------------------------------------
# GET /api/auth/user
# ---------------------------------------------------------------------------

@router.get("/user")
async def get_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Return the current authenticated user's profile."""
    session = get_session_from_request(request)
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_id = session.get("userId")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "data": UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            role=user.role.value,
            avatar=user.avatar,
        )
    }
