"""Pydantic schemas for search/chat endpoints."""

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    session_id: str | None = Field(default=None, alias="sessionId")
    project_id: str = Field(alias="projectId")
    document_types: list[str] | None = Field(default=None, alias="documentTypes")
    user_role: str | None = Field(default=None, alias="userRole")
    scope: str | None = Field(default=None)  # PROJECT | CROSS_PROJECT | WORLD

    model_config = {"populate_by_name": True}
