"""Search orchestration: classify → search → rank → generate answer → suggest follow-ups.

Full pipeline for both PROJECT/CROSS_PROJECT (document search) and WORLD (web search).
"""

import json
import logging
from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.ai import generate_response, generate_web_search_response, WebSearchResponse
from app.services.vector_search import (
    SearchOptions,
    ScoredResult,
    vector_search,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------


@dataclass
class QueryClassification:
    scope: str = "PROJECT"  # PROJECT | CROSS_PROJECT
    intent: str = "factual_lookup"
    document_types: list[str] = field(default_factory=list)
    confidence: float = 0.0


@dataclass
class Source:
    index: int
    document_id: str
    document_name: str
    document_type: str
    page_number: int | None = None
    section_ref: str | None = None
    chunk_id: str = ""


@dataclass
class Alert:
    type: str  # conflict | version_mismatch | superseded
    message: str
    source_indices: list[int] = field(default_factory=list)


@dataclass
class SuggestedPrompt:
    text: str
    category: str  # factual | analysis | action | comparison


@dataclass
class GroupedResult:
    document_id: str
    document_name: str
    document_type: str
    project_id: str
    project_name: str | None = None
    chunks: list[dict] = field(default_factory=list)


@dataclass
class SearchResponse:
    query: str
    scope: str
    classification: QueryClassification | None = None
    filters: dict = field(default_factory=dict)
    results: list[GroupedResult] = field(default_factory=list)
    total_chunks: int = 0
    search_time_ms: int = 0


# ---------------------------------------------------------------------------
# Query Classification
# ---------------------------------------------------------------------------

QUERY_CLASSIFICATION_PROMPT = """You are a search query classifier for a construction project management system. Analyze the user's query and return a JSON object with the following fields:

1. "scope": Either "PROJECT" (query is about the current project) or "CROSS_PROJECT" (query references multiple projects or general knowledge).
   - Default to "PROJECT" unless the query explicitly mentions other projects, comparisons across projects, or portfolio-level topics.

2. "intent": One of:
   - "factual_lookup" — Asking for a specific fact, spec reference, or contract detail.
   - "comparison" — Comparing two things (versions, specs, projects, approaches).
   - "analysis" — Asking for interpretation, implications, risk assessment.
   - "action_request" — Asking what to do, next steps, or requesting a draft.
   - "definition" — Asking what something means or how something works.

3. "documentTypes": Array of relevant document types to filter. Choose from: SPEC, DRAWING, ADDENDUM, RFI, CONTRACT, CHANGE, COMPLIANCE, MEETING, FINANCIAL, SCHEDULE, CLOSEOUT, PORTFOLIO. Return an empty array if no specific type filter is appropriate.

4. "confidence": A number 0.0-1.0 indicating how confident you are in this classification.

Return ONLY valid JSON, no explanation."""


def classify_query(
    query: str, project_id: str, project_name: str
) -> QueryClassification:
    """Classify a search query using Claude Haiku."""
    try:
        response = generate_response(
            model="haiku",
            max_tokens=200,
            temperature=0.1,
            system_prompt=QUERY_CLASSIFICATION_PROMPT,
            user_prompt=f'Query: "{query}"\nCurrent project: {project_name} ({project_id})',
        )
        data = json.loads(response.content)
        return QueryClassification(
            scope=data.get("scope", "PROJECT"),
            intent=data.get("intent", "factual_lookup"),
            document_types=data.get("documentTypes", []),
            confidence=data.get("confidence", 0.0),
        )
    except Exception:
        logger.warning("Query classification failed, defaulting to PROJECT/factual_lookup")
        return QueryClassification()


# ---------------------------------------------------------------------------
# Search & Rank
# ---------------------------------------------------------------------------


async def search_and_rank(
    db: AsyncSession,
    query: str,
    project_id: str,
    scope: str = "PROJECT",
    document_types: list[str] | None = None,
    active_project_id: str | None = None,
) -> list[ScoredResult]:
    """Run hybrid search, merge, score, and return ranked results."""
    return await vector_search(
        db,
        query,
        SearchOptions(
            project_id=project_id if scope == "PROJECT" else None,
            scope=scope,
            document_types=document_types,
            active_project_id=active_project_id or project_id,
            limit=20,
            threshold=0.15,
        ),
    )


# ---------------------------------------------------------------------------
# Answer Generation
# ---------------------------------------------------------------------------

ANSWER_GENERATION_PROMPT = """You are an expert AI assistant for construction project managers using efilo.ai. Generate clear, well-structured, cited answers based on retrieved construction documents.

FORMATTING GUIDELINES:
- Start with a brief **Summary** sentence or two that directly answers the question.
- Use **## headings** to organize distinct topics within the answer.
- Use **bullet points** or **numbered lists** for specifications, requirements, or steps.
- Use **tables** (markdown) when comparing values, listing equipment specs, capacities, or schedules.
- Use **bold** for key terms, values, model numbers, and important figures.
- Keep paragraphs short (2-3 sentences max).

CITATION FORMAT:
- Use inline citations: [Source N] where N is the source number.
- Every factual claim MUST have a citation.
- If multiple sources support a claim, cite all: [Source 1, Source 3].
- ONLY cite sources that directly contain information relevant to the answer. Do NOT cite a source just because it was provided — if a source does not contain information that helps answer the question, do not reference it at all.

CONFLICT DETECTION:
- If sources contradict each other, flag it with "⚠️ **Conflict:**" followed by the details.
- If an Addendum supersedes a Spec, note: "**Note:** Addendum [Source N] supersedes [Source M]."
- If a Drawing conflicts with a Spec, flag it.

RULES:
- Be concise and specific — construction professionals need facts, not fluff.
- If the retrieved documents don't contain enough information, say so clearly.
- Never fabricate information not in the sources.
- Use construction industry terminology appropriately.
- Present numerical data (capacities, dimensions, costs, dates) in tables or structured lists — never bury numbers in long paragraphs."""


def generate_search_answer(
    query: str,
    chunks: list[ScoredResult],
    project_name: str,
    scope: str,
    user_role: str | None = None,
) -> dict:
    """Generate a cited answer from search results.

    Returns: {"response", "sources", "confidence", "alerts", "tokens_used"}
    """
    if not chunks:
        return {
            "response": "No relevant documents were found for your query. Try broadening your search terms or adjusting the document type filters.",
            "sources": [],
            "confidence": 0,
            "alerts": [],
            "tokens_used": {"input": 0, "output": 0},
        }

    # Build sources list
    sources = [
        Source(
            index=i + 1,
            document_id=c.document_id,
            document_name=c.document_name,
            document_type=c.document_type,
            page_number=c.page_number,
            section_ref=c.section_ref,
            chunk_id=c.chunk_id,
        )
        for i, c in enumerate(chunks)
    ]

    # Format chunks as context
    chunks_context = "\n\n---\n\n".join(
        f"[Source {i + 1}: {c.document_name} ({c.document_type})"
        f"{f', p.{c.page_number}' if c.page_number else ''}"
        f"{f', §{c.section_ref}' if c.section_ref else ''}]\n{c.content}"
        for i, c in enumerate(chunks)
    )

    answer = generate_response(
        model="sonnet",
        max_tokens=1000,
        temperature=0.3,
        system_prompt=ANSWER_GENERATION_PROMPT,
        user_prompt=(
            f'Query: "{query}"\n\n'
            f"Project: {project_name}\nScope: {scope}\n"
            f"User Role: {user_role or 'project_manager'}\n\n"
            f"Retrieved Documents:\n{chunks_context}"
        ),
    )

    alerts = _detect_alerts(answer.content, chunks)
    confidence = _calculate_confidence(chunks)

    return {
        "response": answer.content,
        "sources": [_source_to_dict(s) for s in sources],
        "confidence": confidence,
        "alerts": [_alert_to_dict(a) for a in alerts],
        "tokens_used": answer.tokens_used,
    }


def _calculate_confidence(chunks: list[ScoredResult]) -> float:
    if not chunks:
        return 0
    avg = sum(float(c.similarity) for c in chunks) / len(chunks)
    has_strong = any(float(c.similarity) >= 0.72 for c in chunks)
    return min(1.0, avg + (0.1 if has_strong else 0))


def _detect_alerts(response: str, chunks: list[ScoredResult]) -> list[Alert]:
    alerts: list[Alert] = []

    if "CONFLICT:" in response or "\u26a0\ufe0f" in response:
        alerts.append(Alert(
            type="conflict",
            message="Potential conflicts detected between sources. Review highlighted sections.",
            source_indices=list(range(1, len(chunks) + 1)),
        ))

    has_addendum = any(c.document_type == "ADDENDUM" for c in chunks)
    has_spec = any(c.document_type == "SPEC" for c in chunks)
    if has_addendum and has_spec:
        addendum_indices = [
            i + 1 for i, c in enumerate(chunks) if c.document_type == "ADDENDUM"
        ]
        alerts.append(Alert(
            type="superseded",
            message="Addendum found — may supersede earlier specification sections.",
            source_indices=addendum_indices,
        ))

    return alerts


# ---------------------------------------------------------------------------
# Suggested Prompts
# ---------------------------------------------------------------------------

SUGGESTED_PROMPTS_PROMPT = """You are a construction project assistant. Based on the user's last query and the types of documents retrieved, suggest 3 follow-up questions they might want to ask.

Rules:
- Make suggestions specific and actionable.
- Vary the categories: one factual, one analytical, one action-oriented.
- Keep each suggestion under 80 characters.
- Return a JSON array of objects with "text" and "category" fields.
- Categories: "factual", "analysis", "action", "comparison"

Return ONLY valid JSON array, no explanation."""


def generate_suggested_prompts(
    query: str,
    chunks: list[ScoredResult],
    project_name: str,
    scope: str,
    user_role: str | None = None,
) -> list[dict]:
    """Generate follow-up prompt suggestions."""
    try:
        doc_types = ", ".join(sorted({c.document_type for c in chunks}))
        response = generate_response(
            model="haiku",
            max_tokens=300,
            temperature=0.5,
            system_prompt=SUGGESTED_PROMPTS_PROMPT,
            user_prompt=(
                f'Last query: "{query}"\n'
                f"Retrieved doc types: {doc_types}\n"
                f"Scope: {scope}\n"
                f"Project: {project_name}\n"
                f"User role: {user_role or 'project_manager'}"
            ),
        )
        return json.loads(response.content)
    except Exception:
        return [
            {"text": "What are the key deadlines for this project?", "category": "factual"},
            {"text": "Are there any compliance risks I should know about?", "category": "analysis"},
            {"text": "What should I prioritize this week?", "category": "action"},
        ]


# ---------------------------------------------------------------------------
# Group By Document
# ---------------------------------------------------------------------------


def group_by_document(results: list[ScoredResult]) -> list[dict]:
    """Group scored results by document for search response."""
    groups: dict[str, dict] = {}

    for r in results:
        if r.document_id not in groups:
            groups[r.document_id] = {
                "documentId": r.document_id,
                "documentName": r.document_name,
                "documentType": r.document_type,
                "projectId": r.project_id,
                "projectName": r.project_name,
                "chunks": [],
            }
        groups[r.document_id]["chunks"].append({
            "chunkId": r.chunk_id,
            "content": r.content,
            "pageNumber": r.page_number,
            "sectionRef": r.section_ref,
            "similarity": float(r.similarity),
            "finalScore": r.final_score,
            "isMarginally": r.is_marginally,
        })

    grouped = list(groups.values())
    grouped.sort(
        key=lambda g: max(c["finalScore"] for c in g["chunks"]),
        reverse=True,
    )
    return grouped


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------


def _source_to_dict(s: Source) -> dict:
    return {
        "index": s.index,
        "documentId": s.document_id,
        "documentName": s.document_name,
        "documentType": s.document_type,
        "pageNumber": s.page_number,
        "sectionRef": s.section_ref,
        "chunkId": s.chunk_id,
    }


def _alert_to_dict(a: Alert) -> dict:
    return {
        "type": a.type,
        "message": a.message,
        "sourceIndices": a.source_indices,
    }
