"""Pydantic schemas for Documents API."""

from pydantic import BaseModel, Field


class DocumentUploadRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: str
    mime_type: str = Field(alias="mimeType")
    file_size: int = Field(gt=0, alias="fileSize")
    replace: bool = False

    model_config = {"populate_by_name": True}


class BulkDeleteRequest(BaseModel):
    document_ids: list[str] = Field(
        min_length=1, max_length=50, alias="documentIds"
    )

    model_config = {"populate_by_name": True}
