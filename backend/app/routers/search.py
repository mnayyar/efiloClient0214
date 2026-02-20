"""Search API routes.

POST /api/search                            — Search documents (no AI answer)
GET  /api/projects/{id}/search/suggestions  — AI-generated search suggestions
POST /api/search/cross-project              — Cross-project search
"""

import json
import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.document import Document
from app.models.project import Project
from app.models.user import User
from app.services.ai import generate_response
from app.services.search_orchestration import (
    classify_query,
    group_by_document,
    search_and_rank,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["search"])


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    project_id: str = Field(alias="projectId")
    scope: str | None = None  # PROJECT | CROSS_PROJECT
    document_types: list[str] | None = Field(default=None, alias="documentTypes")

    model_config = {"populate_by_name": True}


@router.post("/search")
async def search(
    body: SearchRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Search documents — returns grouped results without AI answer."""
    # Verify project
    result = await db.execute(select(Project).where(Project.id == body.project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    start = time.monotonic()

    # Classify
    classification = classify_query(body.query, project.id, project.name)
    scope = body.scope or classification.scope

    doc_types = (
        body.document_types
        if body.document_types
        else classification.document_types if classification.document_types
        else None
    )

    # Search & rank
    chunks = await search_and_rank(
        db, body.query, project.id,
        scope=scope,
        document_types=doc_types,
        active_project_id=project.id,
    )

    grouped = group_by_document(chunks)
    search_time_ms = int((time.monotonic() - start) * 1000)

    return {
        "data": {
            "query": body.query,
            "scope": scope,
            "classification": {
                "scope": classification.scope,
                "intent": classification.intent,
                "documentTypes": classification.document_types,
                "confidence": classification.confidence,
            },
            "filters": {"documentTypes": doc_types},
            "results": grouped,
            "totalChunks": len(chunks),
            "searchTimeMs": search_time_ms,
        }
    }


# ---------------------------------------------------------------------------
# GET /api/projects/{project_id}/search/suggestions
# ---------------------------------------------------------------------------

SUGGESTIONS_SYSTEM = """You are a construction project assistant for efilo.ai. Based on the types and counts of documents indexed for a project, suggest 6 useful starting queries a project manager might ask.

Rules:
- Make suggestions specific and practical for construction project management.
- Cover different categories: compliance, specs, RFIs, financials, schedule, general.
- Keep each suggestion under 80 characters.
- Return a JSON array of objects with "text" and "category" fields.
- Categories: "compliance", "specs", "rfis", "financial", "schedule", "general"

Return ONLY valid JSON array, no explanation."""


def _default_suggestions(available_types: list[str]) -> list[dict]:
    """Fallback suggestions when AI is unavailable."""
    suggestions: list[dict] = []
    mapping = {
        "SPEC": {"text": "What are the key material specifications?", "category": "specs"},
        "CONTRACT": {"text": "What are the major contract deadlines?", "category": "compliance"},
        "RFI": {"text": "Show me all open RFIs and their status", "category": "rfis"},
        "ADDENDUM": {"text": "What changes were made in the latest addendum?", "category": "specs"},
        "FINANCIAL": {"text": "What is the current budget status?", "category": "financial"},
        "SCHEDULE": {"text": "What milestones are coming up this month?", "category": "schedule"},
    }
    for doc_type, suggestion in mapping.items():
        if doc_type in available_types:
            suggestions.append(suggestion)
    suggestions.append({"text": "Give me a project overview", "category": "general"})
    return suggestions[:6]


@router.get("/projects/{project_id}/search/suggestions")
async def search_suggestions(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get AI-generated search suggestions based on indexed documents."""
    # Verify project
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get document type stats
    result = await db.execute(
        select(Document.type, func.count(Document.id))
        .where(Document.project_id == project_id, Document.status == "READY")
        .group_by(Document.type)
    )
    stats = result.all()

    stat_list = [{"type": row[0], "count": row[1]} for row in stats]
    total_docs = sum(s["count"] for s in stat_list)

    if total_docs == 0:
        return {
            "data": {
                "suggestions": [
                    {"text": "No documents indexed yet — add them via Project Setup", "category": "general"}
                ],
                "documentStats": stat_list,
            }
        }

    # Try AI generation
    stats_desc = ", ".join(f"{s['type']}: {s['count']} documents" for s in stat_list)
    try:
        response = generate_response(
            system_prompt=SUGGESTIONS_SYSTEM,
            user_prompt=f"Project: {project.name}\nIndexed documents: {stats_desc}\nTotal: {total_docs} documents",
            model="sonnet",
            max_tokens=1000,
            temperature=0.5,
        )
        suggestions = json.loads(response.content)
    except Exception:
        suggestions = _default_suggestions([s["type"] for s in stat_list])

    return {"data": {"suggestions": suggestions, "documentStats": stat_list}}


# ---------------------------------------------------------------------------
# POST /api/search/cross-project
# ---------------------------------------------------------------------------


class CrossProjectRequest(BaseModel):
    query: str = Field(min_length=3, max_length=2000)
    types: list[str] | None = None
    active_project_id: str | None = Field(default=None, alias="activeProjectId")

    model_config = {"populate_by_name": True}


@router.post("/search/cross-project")
async def cross_project_search(
    body: CrossProjectRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Search across all projects."""
    start = time.monotonic()

    chunks = await search_and_rank(
        db,
        body.query,
        body.active_project_id or "",
        scope="CROSS_PROJECT",
        document_types=body.types,
        active_project_id=body.active_project_id,
    )

    grouped = group_by_document(chunks)
    search_time_ms = int((time.monotonic() - start) * 1000)

    return {
        "data": {
            "query": body.query,
            "scope": "CROSS_PROJECT",
            "results": grouped,
            "totalChunks": len(chunks),
            "searchTimeMs": search_time_ms,
        }
    }
