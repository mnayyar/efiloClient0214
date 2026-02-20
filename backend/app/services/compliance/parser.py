"""Contract clause extraction via Claude AI.

Parses contract documents to extract compliance-critical clauses using Claude.
Stores extracted clauses in ContractClause model and creates an audit log entry.
"""

import json
import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.compliance import ComplianceAuditLog, ContractClause
from app.models.document import Document
from app.models.enums import ContractClauseKind, ContractClauseMethod, DeadlineType
from app.services.ai import generate_response

from .prompts import CONTRACT_EXTRACTION_SYSTEM, CONTRACT_EXTRACTION_USER

logger = logging.getLogger(__name__)

# Valid enum values for validation
VALID_KINDS = {e.value for e in ContractClauseKind}
VALID_METHODS = {e.value for e in ContractClauseMethod}
VALID_DEADLINE_TYPES = {e.value for e in DeadlineType}


async def extract_clauses_from_document(
    db: AsyncSession,
    project_id: str,
    document_id: str,
    user_id: str | None = None,
) -> list[ContractClause]:
    """Extract compliance clauses from a document using Claude AI.

    Args:
        db: Database session.
        project_id: Project ID.
        document_id: Document to parse.
        user_id: User who initiated the extraction.

    Returns:
        List of created ContractClause records.
    """
    # Load document
    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.project_id == project_id,
        )
    )
    document = result.scalar_one_or_none()
    if not document:
        raise ValueError(f"Document {document_id} not found in project {project_id}")

    # Get document text from chunks
    from app.models.document import DocumentChunk

    chunk_result = await db.execute(
        select(DocumentChunk.content)
        .where(DocumentChunk.document_id == document_id)
        .order_by(DocumentChunk.chunk_index)
    )
    chunks = chunk_result.scalars().all()
    if not chunks:
        raise ValueError(f"Document {document_id} has no text chunks")

    document_text = "\n\n".join(chunks)

    # Truncate if too long (Claude token budget)
    max_chars = 100_000
    if len(document_text) > max_chars:
        document_text = document_text[:max_chars] + "\n\n[... truncated ...]"

    # Build prompt
    user_prompt = CONTRACT_EXTRACTION_USER.format(
        document_name=document.name,
        document_type=document.type.value if document.type else "CONTRACT",
        document_text=document_text,
    )

    # Call Claude (use opus for complex extraction)
    ai_response = generate_response(
        system_prompt=CONTRACT_EXTRACTION_SYSTEM,
        user_prompt=user_prompt,
        model="opus",
        max_tokens=8000,
        temperature=0.1,
    )

    # Parse response
    raw_clauses = _parse_clause_json(ai_response.content)
    if not raw_clauses:
        logger.warning("No clauses extracted from document %s", document_id)
        return []

    # Delete existing AI-extracted clauses for this document (re-extraction)
    existing = await db.execute(
        select(ContractClause).where(
            ContractClause.project_id == project_id,
            ContractClause.source_doc_id == document_id,
            ContractClause.ai_extracted == True,  # noqa: E712
        )
    )
    for old_clause in existing.scalars().all():
        await db.delete(old_clause)

    # Create clause records
    created: list[ContractClause] = []
    for raw in raw_clauses:
        clause = _build_clause(raw, project_id, document_id, ai_response.model)
        if clause:
            db.add(clause)
            created.append(clause)

    # Audit log
    audit = ComplianceAuditLog(
        project_id=project_id,
        event_type="CLAUSE_EXTRACTION",
        entity_type="Document",
        entity_id=document_id,
        user_id=user_id,
        actor_type="AI",
        action="extract_clauses",
        details={
            "documentName": document.name,
            "clausesExtracted": len(created),
            "model": ai_response.model,
            "tokensUsed": ai_response.tokens_used,
        },
    )
    db.add(audit)

    await db.flush()
    logger.info(
        "Extracted %d clauses from document %s (project %s)",
        len(created), document_id, project_id,
    )

    return created


async def get_clauses_for_project(
    db: AsyncSession,
    project_id: str,
    kind: ContractClauseKind | None = None,
    confirmed_only: bool = False,
) -> list[ContractClause]:
    """Get contract clauses for a project."""
    query = select(ContractClause).where(
        ContractClause.project_id == project_id,
    ).order_by(ContractClause.created_at.desc())

    if kind:
        query = query.where(ContractClause.kind == kind)
    if confirmed_only:
        query = query.where(ContractClause.confirmed == True)  # noqa: E712

    result = await db.execute(query)
    return list(result.scalars().all())


async def confirm_clause(
    db: AsyncSession,
    clause_id: str,
    project_id: str,
    user_id: str,
) -> ContractClause | None:
    """Confirm a clause (mark as reviewed and accurate)."""
    result = await db.execute(
        select(ContractClause).where(
            ContractClause.id == clause_id,
            ContractClause.project_id == project_id,
        )
    )
    clause = result.scalar_one_or_none()
    if not clause:
        return None

    clause.confirmed = True
    clause.confirmed_at = func.now()
    clause.confirmed_by = user_id
    clause.requires_review = False

    # Audit log
    audit = ComplianceAuditLog(
        project_id=project_id,
        event_type="CLAUSE_CONFIRMED",
        entity_type="ContractClause",
        entity_id=clause_id,
        user_id=user_id,
        actor_type="USER",
        action="confirm_clause",
        details={"clauseTitle": clause.title, "clauseKind": clause.kind.value},
    )
    db.add(audit)

    await db.flush()
    return clause


def _parse_clause_json(content: str) -> list[dict]:
    """Parse AI response into a list of clause dicts."""
    # Strip markdown code fences if present
    text = content.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first and last lines (```json and ```)
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)

    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict) and "clauses" in parsed:
            return parsed["clauses"]
        return []
    except json.JSONDecodeError:
        # Try to find JSON array in the response
        start = text.find("[")
        end = text.rfind("]")
        if start != -1 and end != -1:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                pass
        logger.error("Failed to parse clause extraction response")
        return []


def _build_clause(
    raw: dict,
    project_id: str,
    document_id: str,
    model: str,
) -> ContractClause | None:
    """Build a ContractClause from raw AI output, with validation."""
    kind_str = raw.get("kind", "")
    if kind_str not in VALID_KINDS:
        logger.warning("Invalid clause kind: %s", kind_str)
        return None

    title = raw.get("title", "")
    content = raw.get("content", "")
    if not title or not content:
        return None

    # Validate optional enums
    notice_method = raw.get("noticeMethod")
    if notice_method and notice_method not in VALID_METHODS:
        notice_method = None

    deadline_type = raw.get("deadlineType")
    if deadline_type and deadline_type not in VALID_DEADLINE_TYPES:
        deadline_type = None

    cure_period_type = raw.get("curePeriodType")
    if cure_period_type and cure_period_type not in VALID_DEADLINE_TYPES:
        cure_period_type = None

    return ContractClause(
        project_id=project_id,
        kind=ContractClauseKind(kind_str),
        title=title,
        content=content,
        section_ref=raw.get("sectionRef"),
        deadline_days=_safe_int(raw.get("deadlineDays")),
        deadline_type=DeadlineType(deadline_type) if deadline_type else None,
        notice_method=ContractClauseMethod(notice_method) if notice_method else None,
        trigger=raw.get("trigger"),
        cure_period_days=_safe_int(raw.get("curePeriodDays")),
        cure_period_type=DeadlineType(cure_period_type) if cure_period_type else None,
        flow_down_provisions=raw.get("flowDownProvisions"),
        parent_clause_ref=raw.get("parentClauseRef"),
        requires_review=raw.get("requiresReview", False),
        review_reason=raw.get("reviewReason"),
        ai_extracted=True,
        ai_model=model,
        source_doc_id=document_id,
    )


def _safe_int(val) -> int | None:
    """Safely convert a value to int."""
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None
