"""Pydantic schemas for RFI endpoints."""

from datetime import datetime

from pydantic import BaseModel, Field


class CreateRFIRequest(BaseModel):
    subject: str = Field(min_length=1, max_length=500)
    question: str = Field(min_length=1)
    priority: str = "MEDIUM"  # LOW | MEDIUM | HIGH | CRITICAL
    assigned_to: str | None = Field(default=None, alias="assignedTo", max_length=255)
    due_date: datetime | None = Field(default=None, alias="dueDate")
    source_doc_ids: list[str] | None = Field(default=None, alias="sourceDocIds")

    model_config = {"populate_by_name": True}


class UpdateRFIRequest(BaseModel):
    subject: str | None = None
    question: str | None = None
    status: str | None = None
    priority: str | None = None
    assigned_to: str | None = Field(default=None, alias="assignedTo")
    due_date: datetime | None = Field(default=None, alias="dueDate")
    response: str | None = None
    co_flag: bool | None = Field(default=None, alias="coFlag")
    co_estimate: float | None = Field(default=None, alias="coEstimate")
    source_doc_ids: list[str] | None = Field(default=None, alias="sourceDocIds")

    model_config = {"populate_by_name": True}


class DraftPreviewRequest(BaseModel):
    subject: str = Field(min_length=1)
    question: str | None = None
    priority: str | None = None
    assigned_to: str | None = Field(default=None, alias="assignedTo")
    source_doc_ids: list[str] | None = Field(default=None, alias="sourceDocIds")

    model_config = {"populate_by_name": True}
