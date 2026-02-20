"""Pydantic schemas for Projects API."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    project_code: str = Field(min_length=1, max_length=50, alias="projectCode")
    type: str
    contract_type: str | None = Field(default=None, alias="contractType")
    contract_value: Decimal | None = Field(default=None, gt=0, alias="contractValue")
    gc_company_name: str | None = Field(default=None, max_length=255, alias="gcCompanyName")
    gc_contact_name: str | None = Field(default=None, max_length=255, alias="gcContactName")
    gc_contact_email: EmailStr | None = Field(default=None, alias="gcContactEmail")
    gc_contact_phone: str | None = Field(default=None, max_length=50, alias="gcContactPhone")
    architect_name: str | None = Field(default=None, max_length=255, alias="architectName")
    architect_email: EmailStr | None = Field(default=None, alias="architectEmail")
    architect_phone: str | None = Field(default=None, max_length=50, alias="architectPhone")
    engineer_name: str | None = Field(default=None, max_length=255, alias="engineerName")
    engineer_email: EmailStr | None = Field(default=None, alias="engineerEmail")
    engineer_phone: str | None = Field(default=None, max_length=50, alias="engineerPhone")
    owner_name: str | None = Field(default=None, max_length=255, alias="ownerName")
    owner_email: EmailStr | None = Field(default=None, alias="ownerEmail")
    owner_phone: str | None = Field(default=None, max_length=50, alias="ownerPhone")

    model_config = {"populate_by_name": True}


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    project_code: str | None = Field(default=None, min_length=1, max_length=50, alias="projectCode")
    type: str | None = None
    contract_type: str | None = Field(default=None, alias="contractType")
    contract_value: Decimal | None = Field(default=None, alias="contractValue")
    status: str | None = Field(default=None, min_length=1, max_length=50)
    gc_company_name: str | None = Field(default=None, alias="gcCompanyName")
    gc_contact_name: str | None = Field(default=None, alias="gcContactName")
    gc_contact_email: EmailStr | None = Field(default=None, alias="gcContactEmail")
    gc_contact_phone: str | None = Field(default=None, alias="gcContactPhone")
    architect_name: str | None = Field(default=None, alias="architectName")
    architect_email: EmailStr | None = Field(default=None, alias="architectEmail")
    architect_phone: str | None = Field(default=None, alias="architectPhone")
    engineer_name: str | None = Field(default=None, alias="engineerName")
    engineer_email: EmailStr | None = Field(default=None, alias="engineerEmail")
    engineer_phone: str | None = Field(default=None, alias="engineerPhone")
    owner_name: str | None = Field(default=None, alias="ownerName")
    owner_email: EmailStr | None = Field(default=None, alias="ownerEmail")
    owner_phone: str | None = Field(default=None, alias="ownerPhone")

    model_config = {"populate_by_name": True}



# Note: Project responses are serialized manually via _project_to_dict()
# in the router to handle the _count field and enum values cleanly.
