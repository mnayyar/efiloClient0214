"""RFI API routes.

Endpoints:
  POST   /api/projects/{projectId}/rfis                      — Create RFI
  GET    /api/projects/{projectId}/rfis                      — List RFIs
  GET    /api/projects/{projectId}/rfis/{rfiId}              — Get RFI
  PATCH  /api/projects/{projectId}/rfis/{rfiId}              — Update RFI
  DELETE /api/projects/{projectId}/rfis/{rfiId}              — Delete RFI
  POST   /api/projects/{projectId}/rfis/draft-preview         — AI draft (no save)
  POST   /api/projects/{projectId}/rfis/{rfiId}/ai-draft      — AI draft (save to RFI)
  POST   /api/projects/{projectId}/rfis/{rfiId}/send-email    — Send RFI email to GC
  POST   /api/projects/{projectId}/rfis/{rfiId}/analyze-response — Analyze GC response
  POST   /api/projects/{projectId}/rfis/{rfiId}/check-compliance — Trigger compliance check
"""

import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.document import DocumentChunk, Document
from app.models.enums import DocumentStatus, RFIPriority, RFIStatus
from app.models.organization import Organization
from app.models.project import Project
from app.models.rfi import RFI
from app.models.user import User
from app.schemas.rfi import CreateRFIRequest, DraftPreviewRequest, UpdateRFIRequest
from app.services.ai import generate_response
from app.services.email import send_rfi_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}/rfis", tags=["rfis"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _rfi_to_dict(rfi: RFI) -> dict:
    """Serialize RFI to camelCase dict."""
    return {
        "id": rfi.id,
        "projectId": rfi.project_id,
        "rfiNumber": rfi.rfi_number,
        "subject": rfi.subject,
        "question": rfi.question,
        "status": rfi.status.value if rfi.status else None,
        "priority": rfi.priority.value if rfi.priority else None,
        "assignedTo": rfi.assigned_to,
        "dueDate": rfi.due_date.isoformat() if rfi.due_date else None,
        "submittedAt": rfi.submitted_at.isoformat() if rfi.submitted_at else None,
        "respondedAt": rfi.responded_at.isoformat() if rfi.responded_at else None,
        "response": rfi.response,
        "aiDraftQuestion": rfi.ai_draft_question,
        "aiDraftModel": rfi.ai_draft_model,
        "aiResponseAnalysis": rfi.ai_response_analysis,
        "coFlag": rfi.co_flag,
        "coEstimate": float(rfi.co_estimate) if rfi.co_estimate is not None else None,
        "isOverdue": rfi.is_overdue,
        "sourceDocIds": rfi.source_doc_ids or [],
        "sourceChunkIds": rfi.source_chunk_ids or [],
        "createdById": rfi.created_by_id,
        "createdAt": rfi.created_at.isoformat() if rfi.created_at else None,
        "updatedAt": rfi.updated_at.isoformat() if rfi.updated_at else None,
    }


async def _get_project_or_404(db: AsyncSession, project_id: str) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _get_rfi_or_404(
    db: AsyncSession, project_id: str, rfi_id: str
) -> RFI:
    result = await db.execute(
        select(RFI).where(RFI.id == rfi_id, RFI.project_id == project_id)
    )
    rfi = result.scalar_one_or_none()
    if not rfi:
        raise HTTPException(status_code=404, detail="RFI not found")
    return rfi


async def _next_rfi_number(db: AsyncSession, project_id: str) -> str:
    """Generate the next RFI number (zero-padded 4 digits)."""
    result = await db.execute(
        select(func.max(RFI.rfi_number)).where(RFI.project_id == project_id)
    )
    max_num = result.scalar()
    if max_num:
        try:
            next_int = int(max_num) + 1
        except ValueError:
            next_int = 1
    else:
        next_int = 1
    return str(next_int).zfill(4)


# ---------------------------------------------------------------------------
# AI Draft Generation
# ---------------------------------------------------------------------------

AI_DRAFT_SYSTEM = """You are an expert construction project RFI writer for MEP contractors.

CRITICAL RULES:
1. Use ACTUAL excerpts from project documents. Extract real spec sections, drawing numbers, capacities, equipment tags, dates.
2. ONLY use [bracketed placeholders] for details NOT in the excerpts.
3. DO NOT fabricate — if it's in excerpts, quote it. If not, use placeholder.
4. Cite document name and page/section when referencing facts.

OUTPUT FORMAT (markdown):
**Background:** Brief paragraph describing the issue.
**References:** List specific document refs, spec sections, drawing numbers, values.
**Question:** The specific, clear question.
**Impact:** Brief statement on schedule/cost impact if not resolved."""


async def _build_document_context(
    db: AsyncSession,
    project_id: str,
    subject: str,
    question: str | None,
    source_doc_ids: list[str] | None,
) -> str:
    """Build document context from chunk keyword matching."""
    # Extract keywords (3+ chars, alphanumeric)
    raw_text = f"{subject} {question or ''}"
    words = re.findall(r"[a-zA-Z0-9]+", raw_text)
    keywords = [w for w in words if len(w) >= 3][:8]

    if not keywords:
        return "No relevant excerpts found. Use placeholders."

    # Build keyword conditions
    conditions = " OR ".join(f"dc.content ILIKE :kw{i}" for i in range(len(keywords)))
    params: dict = {f"kw{i}": f"%{kw}%" for i, kw in enumerate(keywords)}
    params["project_id"] = project_id
    params["limit"] = 20

    if source_doc_ids:
        doc_filter = "AND d.id = ANY(CAST(:doc_ids AS text[]))"
        params["doc_ids"] = "{" + ",".join(source_doc_ids) + "}"
    else:
        doc_filter = ""

    sql = f"""
        SELECT dc.content, dc."pageNumber", dc."sectionRef",
               d.name as doc_name
        FROM "DocumentChunk" dc
        JOIN "Document" d ON dc."documentId" = d.id
        WHERE d."projectId" = :project_id
          AND d.status = 'READY'
          {doc_filter}
          AND ({conditions})
        LIMIT :limit
    """

    result = await db.execute(text(sql), params)
    rows = result.mappings().all()

    if not rows:
        return "No relevant excerpts found. Use placeholders."

    context_parts = []
    for row in rows:
        page = f", p.{row['pageNumber']}" if row.get("pageNumber") else ""
        section = f", §{row['sectionRef']}" if row.get("sectionRef") else ""
        context_parts.append(f"[{row['doc_name']}{page}{section}]\n{row['content']}")

    return "\n\n---\n\n".join(context_parts)


async def _generate_ai_draft(
    db: AsyncSession,
    project_id: str,
    subject: str,
    question: str | None,
    priority: str | None,
    assigned_to: str | None,
    source_doc_ids: list[str] | None,
) -> dict:
    """Generate an AI draft for an RFI."""
    doc_context = await _build_document_context(
        db, project_id, subject, question, source_doc_ids
    )

    user_prompt = (
        f"Draft a professional RFI for:\n"
        f"Subject: {subject}\n"
        f"Rough draft/notes: {question or 'N/A'}\n"
        f"Priority: {priority or 'MEDIUM'}\n"
        f"Assigned to: {assigned_to or 'N/A'}\n\n"
        f"{doc_context}\n\n"
        f"Return ONLY the formatted RFI content."
    )

    response = generate_response(
        model="sonnet",
        max_tokens=2000,
        temperature=0.4,
        system_prompt=AI_DRAFT_SYSTEM,
        user_prompt=user_prompt,
    )

    return {
        "draft": response.content,
        "model": response.model,
        "tokensUsed": response.tokens_used,
    }


# ---------------------------------------------------------------------------
# AI Response Analysis
# ---------------------------------------------------------------------------

AI_ANALYZE_SYSTEM = """You are an expert construction analyst specializing in MEP contracts. Analyze RFI responses for:
1. Completeness — Does response fully answer the question?
2. Change Order Impact — Additional scope/cost/changes? Flag + estimate (Low/Medium/High).
3. Schedule Impact — Timeline implications?
4. Action Items — What follow-up actions?
5. Risk Assessment — Compliance, safety, contractual risks?

Use bullet points. Be concise but thorough."""

CO_KEYWORDS = {"change order", "additional scope", "additional cost"}


# ---------------------------------------------------------------------------
# POST /api/projects/{projectId}/rfis — Create
# ---------------------------------------------------------------------------


@router.post("")
async def create_rfi(
    project_id: str,
    body: CreateRFIRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new RFI."""
    await _get_project_or_404(db, project_id)

    # Validate priority
    try:
        priority = RFIPriority(body.priority)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid priority: {body.priority}")

    rfi_number = await _next_rfi_number(db, project_id)

    rfi = RFI(
        project_id=project_id,
        rfi_number=rfi_number,
        subject=body.subject,
        question=body.question,
        status=RFIStatus.DRAFT,
        priority=priority,
        assigned_to=body.assigned_to,
        due_date=body.due_date,
        source_doc_ids=body.source_doc_ids or [],
        created_by_id=user.id,
    )
    db.add(rfi)
    await db.flush()
    await db.refresh(rfi)

    return {"data": _rfi_to_dict(rfi)}


# ---------------------------------------------------------------------------
# GET /api/projects/{projectId}/rfis — List
# ---------------------------------------------------------------------------


@router.get("")
async def list_rfis(
    project_id: str,
    status: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List RFIs for a project, with optional status/priority filters."""
    await _get_project_or_404(db, project_id)

    query = select(RFI).where(RFI.project_id == project_id)

    if status:
        try:
            query = query.where(RFI.status == RFIStatus(status))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

    if priority:
        try:
            query = query.where(RFI.priority == RFIPriority(priority))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid priority: {priority}")

    query = query.order_by(RFI.created_at.desc())
    result = await db.execute(query)
    rfis = result.scalars().all()

    return {"data": [_rfi_to_dict(r) for r in rfis]}


# ---------------------------------------------------------------------------
# GET /api/projects/{projectId}/rfis/{rfiId} — Get
# ---------------------------------------------------------------------------


@router.get("/{rfi_id}")
async def get_rfi(
    project_id: str,
    rfi_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get a single RFI."""
    rfi = await _get_rfi_or_404(db, project_id, rfi_id)
    return {"data": _rfi_to_dict(rfi)}


# ---------------------------------------------------------------------------
# PATCH /api/projects/{projectId}/rfis/{rfiId} — Update
# ---------------------------------------------------------------------------


@router.patch("/{rfi_id}")
async def update_rfi(
    project_id: str,
    rfi_id: str,
    body: UpdateRFIRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update an RFI. Auto-sets timestamps on status transitions."""
    rfi = await _get_rfi_or_404(db, project_id, rfi_id)
    old_co_flag = rfi.co_flag

    if body.subject is not None:
        rfi.subject = body.subject
    if body.question is not None:
        rfi.question = body.question
    if body.priority is not None:
        try:
            rfi.priority = RFIPriority(body.priority)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid priority: {body.priority}")
    if body.assigned_to is not None:
        rfi.assigned_to = body.assigned_to
    if body.due_date is not None:
        rfi.due_date = body.due_date
    if body.response is not None:
        rfi.response = body.response
    if body.co_flag is not None:
        rfi.co_flag = body.co_flag
    if body.co_estimate is not None:
        rfi.co_estimate = body.co_estimate
    if body.source_doc_ids is not None:
        rfi.source_doc_ids = body.source_doc_ids

    # Status transitions
    if body.status is not None:
        try:
            new_status = RFIStatus(body.status)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")

        rfi.status = new_status
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        if new_status == RFIStatus.SUBMITTED and rfi.submitted_at is None:
            rfi.submitted_at = now
        if new_status == RFIStatus.ANSWERED and rfi.responded_at is None:
            rfi.responded_at = now

    await db.flush()
    await db.refresh(rfi)

    # If coFlag changed to true, trigger compliance check (best-effort)
    if body.co_flag and not old_co_flag:
        try:
            from app.tasks.compliance_triggers import check_rfi_compliance
            check_rfi_compliance.delay(rfi.id, user.id)
        except Exception:
            logger.warning("Failed to dispatch compliance check for RFI %s", rfi.id)

    return {"data": _rfi_to_dict(rfi)}


# ---------------------------------------------------------------------------
# DELETE /api/projects/{projectId}/rfis/{rfiId} — Delete
# ---------------------------------------------------------------------------


@router.delete("/{rfi_id}")
async def delete_rfi(
    project_id: str,
    rfi_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete an RFI."""
    rfi = await _get_rfi_or_404(db, project_id, rfi_id)
    await db.delete(rfi)
    await db.flush()
    return {"data": {"deleted": True}}


# ---------------------------------------------------------------------------
# POST /api/projects/{projectId}/rfis/draft-preview — AI draft (no save)
# ---------------------------------------------------------------------------


@router.post("/draft-preview")
async def draft_preview(
    project_id: str,
    body: DraftPreviewRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate an AI draft for review (does not save)."""
    await _get_project_or_404(db, project_id)

    result = await _generate_ai_draft(
        db, project_id, body.subject, body.question,
        body.priority, body.assigned_to, body.source_doc_ids,
    )

    return {"data": result}


# ---------------------------------------------------------------------------
# POST /api/projects/{projectId}/rfis/{rfiId}/ai-draft — AI draft (save)
# ---------------------------------------------------------------------------


@router.post("/{rfi_id}/ai-draft")
async def ai_draft(
    project_id: str,
    rfi_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate AI draft and save to RFI record."""
    rfi = await _get_rfi_or_404(db, project_id, rfi_id)

    result = await _generate_ai_draft(
        db, project_id, rfi.subject, rfi.question,
        rfi.priority.value if rfi.priority else None,
        rfi.assigned_to, rfi.source_doc_ids,
    )

    rfi.ai_draft_question = result["draft"]
    rfi.ai_draft_model = result["model"]
    await db.flush()
    await db.refresh(rfi)

    return {
        "data": {
            **result,
            "rfi": _rfi_to_dict(rfi),
        }
    }


# ---------------------------------------------------------------------------
# POST /api/projects/{projectId}/rfis/{rfiId}/send-email — Send to GC
# ---------------------------------------------------------------------------


@router.post("/{rfi_id}/send-email")
async def send_email(
    project_id: str,
    rfi_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Send the RFI to the GC contact via email."""
    rfi = await _get_rfi_or_404(db, project_id, rfi_id)

    # Fetch project for GC contact
    project = await _get_project_or_404(db, project_id)
    if not project.gc_contact_email:
        raise HTTPException(
            status_code=400,
            detail="Project has no GC contact email configured. Update project settings first.",
        )

    # Fetch organization for from email
    result = await db.execute(select(Organization).limit(1))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=500, detail="Organization not found")

    from_email = f"noreply@{org.reply_to_domain}" if org.reply_to_domain else "noreply@efilo.ai"
    from_name = f"{user.name} via {org.name}"

    success = send_rfi_email(
        from_name=from_name,
        from_email=from_email,
        reply_to=user.email,
        to=project.gc_contact_email,
        to_name=project.gc_contact_name,
        cc=user.email,
        rfi_number=rfi.rfi_number,
        subject=rfi.subject,
        question=rfi.question,
        project_name=project.name,
    )

    if not success:
        raise HTTPException(status_code=502, detail="Failed to send email — check SMTP configuration")

    # Update status
    rfi.status = RFIStatus.SUBMITTED
    if rfi.submitted_at is None:
        rfi.submitted_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.flush()
    await db.refresh(rfi)

    return {"data": {"success": True, "rfi": _rfi_to_dict(rfi)}}


# ---------------------------------------------------------------------------
# POST /api/projects/{projectId}/rfis/{rfiId}/analyze-response — Analyze
# ---------------------------------------------------------------------------


@router.post("/{rfi_id}/analyze-response")
async def analyze_response(
    project_id: str,
    rfi_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Analyze the GC's response to an RFI using AI."""
    rfi = await _get_rfi_or_404(db, project_id, rfi_id)

    if not rfi.response:
        raise HTTPException(status_code=400, detail="RFI has no response to analyze")

    user_prompt = (
        f"RFI #: {rfi.rfi_number}\n"
        f"Subject: {rfi.subject}\n"
        f"Priority: {rfi.priority.value if rfi.priority else 'MEDIUM'}\n\n"
        f"Original Question:\n{rfi.question}\n\n"
        f"Response Received:\n{rfi.response}\n\n"
        f"Provide structured analysis."
    )

    response = generate_response(
        model="sonnet",
        max_tokens=2000,
        temperature=0.3,
        system_prompt=AI_ANALYZE_SYSTEM,
        user_prompt=user_prompt,
    )

    # Check for change order indicators
    analysis_lower = response.content.lower()
    co_detected = any(kw in analysis_lower for kw in CO_KEYWORDS)
    if "impact" in analysis_lower and "high" in analysis_lower:
        co_detected = True

    rfi.ai_response_analysis = response.content
    if co_detected and not rfi.co_flag:
        rfi.co_flag = True

    await db.flush()
    await db.refresh(rfi)

    return {
        "data": {
            "analysis": response.content,
            "coDetected": co_detected,
            "model": response.model,
            "tokensUsed": response.tokens_used,
            "rfi": _rfi_to_dict(rfi),
        }
    }


# ---------------------------------------------------------------------------
# POST /api/projects/{projectId}/rfis/{rfiId}/check-compliance
# ---------------------------------------------------------------------------


@router.post("/{rfi_id}/check-compliance")
async def check_compliance(
    project_id: str,
    rfi_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Trigger a compliance check for this RFI (creates deadlines if applicable)."""
    rfi = await _get_rfi_or_404(db, project_id, rfi_id)

    # Compliance check will be implemented in Phase 8
    # For now, return a stub response
    return {
        "data": {
            "deadlinesCreated": 0,
            "deadlineIds": [],
            "skippedReasons": ["Compliance engine integration pending (Phase 8)"],
        }
    }
