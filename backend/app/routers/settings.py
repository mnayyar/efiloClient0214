"""Settings API routes (admin-only).

Endpoints:
  GET    /api/settings/organization       — Get organization
  PATCH  /api/settings/organization       — Update organization
  POST   /api/settings/organization/logo  — Upload logo
  DELETE /api/settings/organization/logo  — Delete logo
  GET    /api/settings/users              — List users
  POST   /api/settings/users              — Create user
  PATCH  /api/settings/users/{userId}     — Update user
  DELETE /api/settings/users/{userId}     — Delete user
"""

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.enums import AuthMethod, UserRole
from app.models.organization import Organization
from app.models.user import User
from app.schemas.settings import (
    OrganizationResponse,
    OrganizationUpdate,
    UserCreate,
    UserResponse,
    UserUpdate,
)

router = APIRouter(prefix="/settings", tags=["settings"])

ALLOWED_LOGO_TYPES = {"image/png", "image/jpeg", "image/svg+xml", "image/webp"}
MAX_LOGO_SIZE = 2 * 1024 * 1024  # 2 MB


# ---------------------------------------------------------------------------
# Admin dependency
# ---------------------------------------------------------------------------

async def require_admin(user: User = Depends(get_current_user)) -> User:
    """Ensure the current user has ADMIN role."""
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _org_to_dict(org: Organization) -> dict:
    """Serialize Organization to camelCase dict."""
    return {
        "id": org.id,
        "name": org.name,
        "slug": org.slug,
        "logo": org.logo,
        "primaryColor": org.primary_color,
        "billingEmail": org.billing_email,
        "street": org.street,
        "street2": org.street2,
        "city": org.city,
        "state": org.state,
        "zipCode": org.zip_code,
        "country": org.country,
        "replyToDomain": org.reply_to_domain,
        "maxProjects": org.max_projects,
        "maxUsers": org.max_users,
        "workosOrgId": org.workos_org_id,
        "ssoEnabled": org.sso_enabled,
        "ssoProvider": org.sso_provider,
        "createdAt": org.created_at.isoformat() if org.created_at else None,
        "updatedAt": org.updated_at.isoformat() if org.updated_at else None,
    }


def _user_to_dict(user: User) -> dict:
    """Serialize User to camelCase dict (excludes passwordHash)."""
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "role": user.role.value if user.role else None,
        "authMethod": user.auth_method.value if user.auth_method else None,
        "avatar": user.avatar,
        "lastLoginAt": user.last_login_at.isoformat() if user.last_login_at else None,
        "createdAt": user.created_at.isoformat() if user.created_at else None,
    }


async def _get_org(db: AsyncSession) -> Organization:
    """Fetch the single organization record."""
    result = await db.execute(select(Organization).limit(1))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


# ---------------------------------------------------------------------------
# GET /api/settings/organization
# ---------------------------------------------------------------------------

@router.get("/organization")
async def get_organization(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Fetch the organization."""
    org = await _get_org(db)
    return {"data": _org_to_dict(org)}


# ---------------------------------------------------------------------------
# PATCH /api/settings/organization
# ---------------------------------------------------------------------------

@router.patch("/organization")
async def update_organization(
    body: OrganizationUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Update organization settings."""
    org = await _get_org(db)
    update_data = body.model_dump(exclude_unset=True, by_alias=False)

    for field, value in update_data.items():
        setattr(org, field, value)

    await db.flush()
    await db.refresh(org)
    return {"data": _org_to_dict(org)}


# ---------------------------------------------------------------------------
# POST /api/settings/organization/logo
# ---------------------------------------------------------------------------

@router.post("/organization/logo")
async def upload_logo(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Upload organization logo to R2."""
    if not file.content_type or file.content_type not in ALLOWED_LOGO_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_LOGO_TYPES)}",
        )

    contents = await file.read()
    if len(contents) > MAX_LOGO_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Max 2 MB.")

    org = await _get_org(db)

    # Determine extension from MIME type
    ext_map = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/svg+xml": "svg",
        "image/webp": "webp",
    }
    ext = ext_map.get(file.content_type, "png")
    r2_key = f"org/logo/logo.{ext}"

    # Upload to R2
    try:
        from app.config import get_settings

        settings = get_settings()
        if settings.r2_account_id and settings.r2_access_key_id:
            import boto3

            s3 = boto3.client(
                "s3",
                endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
                aws_access_key_id=settings.r2_access_key_id,
                aws_secret_access_key=settings.r2_secret_access_key,
            )
            s3.put_object(
                Bucket=settings.r2_bucket_name,
                Key=r2_key,
                Body=contents,
                ContentType=file.content_type,
            )
            logo_url = f"{settings.r2_public_url}/{r2_key}" if settings.r2_public_url else r2_key
        else:
            # No R2 configured — store key only
            logo_url = r2_key
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to upload: {exc}") from exc

    org.logo = logo_url
    await db.flush()

    return {"data": {"logo": logo_url}}


# ---------------------------------------------------------------------------
# DELETE /api/settings/organization/logo
# ---------------------------------------------------------------------------

@router.delete("/organization/logo")
async def delete_logo(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Remove organization logo."""
    org = await _get_org(db)

    if org.logo:
        # Try to delete from R2 (silent failure if not found)
        try:
            from app.config import get_settings

            settings = get_settings()
            if settings.r2_account_id and settings.r2_access_key_id:
                import boto3

                s3 = boto3.client(
                    "s3",
                    endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
                    aws_access_key_id=settings.r2_access_key_id,
                    aws_secret_access_key=settings.r2_secret_access_key,
                )
                # Extract R2 key from URL or use as-is
                r2_key = org.logo
                if "/" in r2_key and "://" in r2_key:
                    r2_key = "/".join(r2_key.split("/")[3:])
                s3.delete_object(Bucket=settings.r2_bucket_name, Key=r2_key)
        except Exception:
            pass  # Silent failure for R2 cleanup

    org.logo = None
    await db.flush()

    return {"data": {"logo": None}}


# ---------------------------------------------------------------------------
# GET /api/settings/users
# ---------------------------------------------------------------------------

@router.get("/users")
async def list_users(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """List all users in the organization."""
    result = await db.execute(
        select(User).order_by(User.created_at.asc())
    )
    users = result.scalars().all()
    return {"data": [_user_to_dict(u) for u in users]}


# ---------------------------------------------------------------------------
# POST /api/settings/users
# ---------------------------------------------------------------------------

@router.post("/users", status_code=201)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Create a new user."""
    auth_method = AuthMethod(body.auth_method)

    # If EMAIL_PASSWORD, password is required
    if auth_method == AuthMethod.EMAIL_PASSWORD and not body.password:
        raise HTTPException(
            status_code=400,
            detail="Password is required for EMAIL_PASSWORD auth method",
        )

    # Check email uniqueness
    result = await db.execute(
        select(User).where(func.lower(User.email) == body.email.lower())
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already exists")

    # Hash password if provided
    password_hash = None
    if body.password and auth_method == AuthMethod.EMAIL_PASSWORD:
        password_hash = bcrypt.hashpw(
            body.password.encode(), bcrypt.gensalt(rounds=12)
        ).decode()

    new_user = User(
        email=body.email.lower(),
        name=body.name,
        role=UserRole(body.role),
        auth_method=auth_method,
        password_hash=password_hash,
        phone=body.phone,
        organization_id=admin.organization_id,
    )
    db.add(new_user)

    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Email already exists")

    return {"data": _user_to_dict(new_user)}


# ---------------------------------------------------------------------------
# PATCH /api/settings/users/{userId}
# ---------------------------------------------------------------------------

@router.patch("/users/{user_id}")
async def update_user(
    user_id: str,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update an existing user."""
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = body.model_dump(exclude_unset=True, by_alias=False)

    # Handle password update
    password = update_data.pop("password", None)
    if password and target.auth_method == AuthMethod.EMAIL_PASSWORD:
        target.password_hash = bcrypt.hashpw(
            password.encode(), bcrypt.gensalt(rounds=12)
        ).decode()

    for field, value in update_data.items():
        if field == "role" and value:
            value = UserRole(value)
        setattr(target, field, value)

    await db.flush()
    await db.refresh(target)
    return {"data": _user_to_dict(target)}


# ---------------------------------------------------------------------------
# DELETE /api/settings/users/{userId}
# ---------------------------------------------------------------------------

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Delete a user (cannot delete yourself)."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    await db.delete(target)
    await db.flush()

    return {"data": {"success": True}}
