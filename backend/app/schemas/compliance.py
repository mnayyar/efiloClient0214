"""Pydantic schemas for compliance API requests and responses."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Contract Clauses
# ---------------------------------------------------------------------------

class ParseContractRequest(BaseModel):
    document_id: str = Field(alias="documentId")

    model_config = {"populate_by_name": True}


class ConfirmClauseRequest(BaseModel):
    pass  # No body needed, just the route params


# ---------------------------------------------------------------------------
# Deadlines
# ---------------------------------------------------------------------------

class CreateDeadlineRequest(BaseModel):
    clause_id: str = Field(alias="clauseId")
    trigger_event_type: str = Field(alias="triggerEventType")
    trigger_description: str = Field(alias="triggerDescription")
    triggered_at: datetime = Field(alias="triggeredAt")
    trigger_event_id: str | None = Field(default=None, alias="triggerEventId")

    model_config = {"populate_by_name": True}


class WaiveDeadlineRequest(BaseModel):
    reason: str = Field(min_length=1)


# ---------------------------------------------------------------------------
# Notices
# ---------------------------------------------------------------------------

class CreateNoticeRequest(BaseModel):
    type: str  # ComplianceNoticeType value
    title: str = Field(min_length=1, max_length=500)
    clause_id: str | None = Field(default=None, alias="clauseId")
    deadline_id: str | None = Field(default=None, alias="deadlineId")
    recipient_name: str | None = Field(default=None, alias="recipientName")
    recipient_email: str | None = Field(default=None, alias="recipientEmail")
    generate_with_ai: bool = Field(default=False, alias="generateWithAI")

    # For AI generation
    trigger_description: str | None = Field(default=None, alias="triggerDescription")
    trigger_date: datetime | None = Field(default=None, alias="triggerDate")
    deadline_date: datetime | None = Field(default=None, alias="deadlineDate")
    additional_context: str | None = Field(default=None, alias="additionalContext")

    model_config = {"populate_by_name": True}


class UpdateNoticeRequest(BaseModel):
    content: str | None = Field(default=None, min_length=1)
    title: str | None = Field(default=None, min_length=1, max_length=500)
    status: str | None = None
    recipient_name: str | None = Field(default=None, alias="recipientName")
    recipient_email: str | None = Field(default=None, alias="recipientEmail")

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Holidays
# ---------------------------------------------------------------------------

class CreateHolidayRequest(BaseModel):
    date: str  # ISO date string YYYY-MM-DD
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    recurring: bool = False


# ---------------------------------------------------------------------------
# Score History
# ---------------------------------------------------------------------------

VALID_PERIODS = {"week", "month", "quarter", "year"}
