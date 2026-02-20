"""Pydantic schemas for Settings API."""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


# ---------------------------------------------------------------------------
# Organization
# ---------------------------------------------------------------------------

class OrganizationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    billing_email: EmailStr | None = Field(default=None, alias="billingEmail")
    primary_color: str | None = Field(default=None, alias="primaryColor")
    street: str | None = Field(default=None, max_length=255)
    street2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    zip_code: str | None = Field(default=None, max_length=20, alias="zipCode")
    country: str | None = Field(default=None, max_length=100)
    reply_to_domain: str | None = Field(default=None, max_length=255, alias="replyToDomain")

    model_config = {"populate_by_name": True}


class OrganizationResponse(BaseModel):
    id: str
    name: str
    slug: str
    logo: str | None = None
    primary_color: str = Field(alias="primaryColor")
    billing_email: str = Field(alias="billingEmail")
    street: str | None = None
    street2: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = Field(default=None, alias="zipCode")
    country: str
    reply_to_domain: str | None = Field(default=None, alias="replyToDomain")
    max_projects: int = Field(alias="maxProjects")
    max_users: int = Field(alias="maxUsers")
    workos_org_id: str | None = Field(default=None, alias="workosOrgId")
    sso_enabled: bool = Field(alias="ssoEnabled")
    sso_provider: str | None = Field(default=None, alias="ssoProvider")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = {"populate_by_name": True, "from_attributes": True}


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    role: str
    phone: str | None = Field(default=None, max_length=50)
    auth_method: str = Field(alias="authMethod")
    password: str | None = Field(default=None, min_length=8)

    model_config = {"populate_by_name": True}


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    role: str | None = None
    password: str | None = Field(default=None, min_length=8)

    model_config = {"populate_by_name": True}


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    phone: str | None = None
    role: str
    auth_method: str = Field(alias="authMethod")
    avatar: str | None = None
    last_login_at: datetime | None = Field(default=None, alias="lastLoginAt")
    created_at: datetime = Field(alias="createdAt")

    model_config = {"populate_by_name": True, "from_attributes": True}
