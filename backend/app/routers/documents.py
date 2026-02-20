"""Documents API routes.

Endpoints:
  POST   /api/projects/{projectId}/documents              — Request presigned upload URL
  GET    /api/projects/{projectId}/documents              — List documents
  GET    /api/projects/{projectId}/documents/{docId}      — Get document metadata
  PATCH  /api/projects/{projectId}/documents/{docId}      — Reprocess document
  DELETE /api/projects/{projectId}/documents/{docId}      — Delete document
  GET    /api/projects/{projectId}/documents/{docId}/download  — Presigned download URL
  POST   /api/projects/{projectId}/documents/{docId}/confirm   — Confirm upload
  POST   /api/projects/{projectId}/documents/reprocess    — Bulk reprocess
  POST   /api/projects/{projectId}/documents/bulk-delete  — Bulk delete
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import array as pg_array, ARRAY
import sqlalchemy as sa

from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.change import ChangeEvent
from app.models.document import Document, DocumentChunk
from app.models.enums import DocumentStatus, DocumentType
from app.models.meeting import TalkingPoint
from app.models.project import Project
from app.models.rfi import RFI
from app.models.user import User
from app.schemas.document import BulkDeleteRequest, DocumentUploadRequest
from app.services.r2 import (
    build_r2_key,
    delete_from_r2,
    get_presigned_download_url,
    get_presigned_upload_url,
)
from app.tasks.celery_app import celery as celery_app

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}/documents", tags=["documents"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _doc_to_dict(doc: Document, chunk_count: int | None = None) -> dict:
    """Serialize a Document to camelCase dict."""
    result = {
        "id": doc.id,
        "name": doc.name,
        "type": doc.type.value if doc.type else None,
        "status": doc.status.value if doc.status else None,
        "mimeType": doc.mime_type,
        "fileSize": doc.file_size,
        "pageCount": doc.page_count,
        "createdAt": doc.created_at.isoformat() if doc.created_at else None,
        "updatedAt": doc.updated_at.isoformat() if doc.updated_at else None,
    }
    if chunk_count is not None:
        result["chunkCount"] = chunk_count
    return result


async def _get_project_or_404(db: AsyncSession, project_id: str) -> Project:
    """Fetch project or raise 404."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _get_document_or_404(
    db: AsyncSession, project_id: str, doc_id: str
) -> Document:
    """Fetch document matching project_id or raise 404."""
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id, Document.project_id == project_id
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


async def _cleanup_source_doc_refs(
    db: AsyncSession, project_id: str, doc_id: str
) -> None:
    """Remove doc_id from sourceDocIds arrays in RFI, ChangeEvent, TalkingPoint."""
    # RFI and ChangeEvent have project_id
    for model in [RFI, ChangeEvent]:
        await db.execute(
            update(model)
            .where(model.project_id == project_id)
            .where(model.source_doc_ids.any(doc_id))
            .values(source_doc_ids=sa.func.array_remove(model.source_doc_ids, doc_id))
        )
    # TalkingPoint has meeting_id, not project_id — filter by doc_id only (IDs are unique)
    await db.execute(
        update(TalkingPoint)
        .where(TalkingPoint.source_doc_ids.any(doc_id))
        .values(source_doc_ids=sa.func.array_remove(TalkingPoint.source_doc_ids, doc_id))
    )


def _dispatch_ingestion(doc_id: str, project_id: str) -> None:
    """Dispatch ingestion task to Celery (best-effort)."""
    try:
        celery_app.send_task("document.ingest", args=[doc_id, project_id])
    except Exception:
        logger.warning("Failed to dispatch Celery task for %s — Redis may be down", doc_id)


def _safe_r2_delete(r2_key: str) -> bool:
    """Attempt R2 delete, return True on success, False on failure."""
    try:
        delete_from_r2(r2_key)
        return True
    except Exception:
        logger.warning("Failed to delete R2 key %s — queue for cleanup", r2_key)
        return False


# ---------------------------------------------------------------------------
# POST /api/projects/{projectId}/documents — Request presigned upload URL
# ---------------------------------------------------------------------------

@router.post("")
async def request_upload(
    project_id: str,
    body: DocumentUploadRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create document record and return presigned upload URL."""
    await _get_project_or_404(db, project_id)

    # Validate document type
    try:
        doc_type = DocumentType(body.type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid document type: {body.type}")

    # Check for duplicate name (READY, PROCESSING, or UPLOADING)
    result = await db.execute(
        select(Document).where(
            Document.project_id == project_id,
            Document.name == body.name,
            Document.status.in_([
                DocumentStatus.READY,
                DocumentStatus.PROCESSING,
                DocumentStatus.UPLOADING,
            ]),
        )
    )
    existing = result.scalar_one_or_none()

    if existing and not body.replace:
        return {
            "error": "duplicate",
            "message": f'"{body.name}" already exists in this project.',
            "existingDocument": {
                "id": existing.id,
                "name": existing.name,
                "status": existing.status.value,
                "updatedAt": existing.updated_at.isoformat() if existing.updated_at else None,
                "r2Key": existing.r2_key,
            },
        }

    if existing and body.replace:
        # Delete old document (cascade handles chunks/revisions)
        old_r2_key = existing.r2_key
        await db.delete(existing)
        await db.flush()
        _safe_r2_delete(old_r2_key)

    # Create document record
    doc = Document(
        project_id=project_id,
        name=body.name,
        type=doc_type,
        status=DocumentStatus.UPLOADING,
        mime_type=body.mime_type,
        file_size=body.file_size,
        r2_key="",  # Placeholder until we have the ID
        uploaded_by_id=user.id,
    )
    db.add(doc)
    await db.flush()

    # Build R2 key with the new document ID
    r2_key = build_r2_key(project_id, doc.id, body.name)
    doc.r2_key = r2_key
    await db.flush()

    # Generate presigned upload URL
    upload_url = get_presigned_upload_url(r2_key, body.mime_type)

    return {
        "data": {
            "documentId": doc.id,
            "uploadUrl": upload_url,
            "r2Key": r2_key,
        }
    }


# ---------------------------------------------------------------------------
# GET /api/projects/{projectId}/documents — List documents
# ---------------------------------------------------------------------------

@router.get("")
async def list_documents(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all documents in a project."""
    await _get_project_or_404(db, project_id)

    result = await db.execute(
        select(Document)
        .where(Document.project_id == project_id)
        .order_by(Document.created_at.desc())
    )
    docs = result.scalars().all()
    return {"data": [_doc_to_dict(d) for d in docs]}


# ---------------------------------------------------------------------------
# GET /api/projects/{projectId}/documents/{docId} — Document metadata
# ---------------------------------------------------------------------------

@router.get("/{doc_id}")
async def get_document(
    project_id: str,
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get single document with chunk count."""
    doc = await _get_document_or_404(db, project_id, doc_id)

    # Count chunks
    chunk_result = await db.execute(
        select(func.count())
        .select_from(DocumentChunk)
        .where(DocumentChunk.document_id == doc_id)
    )
    chunk_count = chunk_result.scalar() or 0

    return {"data": _doc_to_dict(doc, chunk_count=chunk_count)}


# ---------------------------------------------------------------------------
# PATCH /api/projects/{projectId}/documents/{docId} — Reprocess
# ---------------------------------------------------------------------------

@router.patch("/{doc_id}")
async def reprocess_document(
    project_id: str,
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete chunks and re-trigger ingestion pipeline."""
    doc = await _get_document_or_404(db, project_id, doc_id)

    # Delete existing chunks
    await db.execute(
        sa.delete(DocumentChunk).where(DocumentChunk.document_id == doc_id)
    )

    # Update status
    doc.status = DocumentStatus.PROCESSING
    await db.flush()

    _dispatch_ingestion(doc_id, project_id)

    await db.refresh(doc)
    return {"data": {"success": True, "status": doc.status.value}}


# ---------------------------------------------------------------------------
# DELETE /api/projects/{projectId}/documents/{docId} — Delete document
# ---------------------------------------------------------------------------

@router.delete("/{doc_id}")
async def delete_document(
    project_id: str,
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete document, cascade chunks/revisions, clean R2 + references."""
    doc = await _get_document_or_404(db, project_id, doc_id)
    r2_key = doc.r2_key

    # Clean up sourceDocIds references
    await _cleanup_source_doc_refs(db, project_id, doc_id)

    # Delete from DB (cascade handles chunks + revisions)
    await db.delete(doc)
    await db.flush()

    # Delete from R2
    _safe_r2_delete(r2_key)

    return {"data": {"success": True}}


# ---------------------------------------------------------------------------
# GET /api/projects/{projectId}/documents/{docId}/download
# ---------------------------------------------------------------------------

@router.get("/{doc_id}/download")
async def download_document(
    project_id: str,
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get presigned download URL."""
    doc = await _get_document_or_404(db, project_id, doc_id)

    download_url = get_presigned_download_url(doc.r2_key)
    return {
        "data": {
            "downloadUrl": download_url,
            "name": doc.name,
            "mimeType": doc.mime_type,
        }
    }


# ---------------------------------------------------------------------------
# POST /api/projects/{projectId}/documents/{docId}/confirm
# ---------------------------------------------------------------------------

@router.post("/{doc_id}/confirm")
async def confirm_upload(
    project_id: str,
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Confirm upload completed, trigger ingestion pipeline."""
    doc = await _get_document_or_404(db, project_id, doc_id)

    if doc.status != DocumentStatus.UPLOADING:
        raise HTTPException(
            status_code=400,
            detail=f"Document is not in UPLOADING state (current: {doc.status.value})",
        )

    doc.status = DocumentStatus.PROCESSING
    await db.flush()

    _dispatch_ingestion(doc_id, project_id)

    await db.refresh(doc)
    return {"data": {"status": doc.status.value}}


# ---------------------------------------------------------------------------
# POST /api/projects/{projectId}/documents/reprocess — Bulk reprocess
# ---------------------------------------------------------------------------

@router.post("/reprocess")
async def bulk_reprocess(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Re-trigger ingestion for all READY documents in project."""
    await _get_project_or_404(db, project_id)

    result = await db.execute(
        select(Document).where(
            Document.project_id == project_id,
            Document.status == DocumentStatus.READY,
        )
    )
    docs = result.scalars().all()

    for doc in docs:
        # Delete existing chunks
        await db.execute(
            sa.delete(DocumentChunk).where(DocumentChunk.document_id == doc.id)
        )
        doc.status = DocumentStatus.PROCESSING
        _dispatch_ingestion(doc.id, project_id)

    await db.flush()
    return {"data": {"requeued": len(docs)}}


# ---------------------------------------------------------------------------
# POST /api/projects/{projectId}/documents/bulk-delete
# ---------------------------------------------------------------------------

@router.post("/bulk-delete")
async def bulk_delete(
    project_id: str,
    body: BulkDeleteRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete multiple documents at once."""
    await _get_project_or_404(db, project_id)

    # Fetch matching documents
    result = await db.execute(
        select(Document).where(
            Document.id.in_(body.document_ids),
            Document.project_id == project_id,
        )
    )
    docs = result.scalars().all()

    if not docs:
        raise HTTPException(status_code=404, detail="No matching documents found")

    r2_queued = 0
    for doc in docs:
        await _cleanup_source_doc_refs(db, project_id, doc.id)
        await db.delete(doc)

    await db.flush()

    # Delete from R2
    for doc in docs:
        if not _safe_r2_delete(doc.r2_key):
            r2_queued += 1

    return {
        "data": {
            "deleted": len(docs),
            "requested": len(body.document_ids),
            "r2Queued": r2_queued,
        }
    }
