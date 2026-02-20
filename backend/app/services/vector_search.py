"""Hybrid vector + keyword search over document chunks.

Runs cosine similarity (pgvector) and Postgres full-text search in parallel,
merges results, applies scoring and diversity filtering.
"""

import logging
import re
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.embeddings import generate_embedding

logger = logging.getLogger(__name__)

# Document type weights (from docs/SEARCH.md)
TYPE_WEIGHTS: dict[str, float] = {
    "SPEC": 1.3,
    "DRAWING": 1.25,
    "ADDENDUM": 1.4,
    "RFI": 1.1,
    "CONTRACT": 1.2,
    "CHANGE": 1.35,
    "COMPLIANCE": 1.15,
    "MEETING": 0.9,
    "FINANCIAL": 1.25,
    "SCHEDULE": 1.15,
    "CLOSEOUT": 0.8,
    "PORTFOLIO": 1.0,
}


@dataclass
class SearchOptions:
    project_id: str | None = None
    scope: str = "PROJECT"  # PROJECT | CROSS_PROJECT
    document_types: list[str] | None = None
    limit: int = 20
    threshold: float = 0.15
    active_project_id: str | None = None


@dataclass
class RawResult:
    chunk_id: str
    content: str
    page_number: int | None
    section_ref: str | None
    metadata: dict | None
    document_id: str
    document_name: str
    document_type: str
    project_id: str
    project_name: str | None
    similarity: float
    created_at: str | None


@dataclass
class ScoredResult(RawResult):
    final_score: float = 0.0
    is_marginally: bool = False


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


async def vector_search(
    db: AsyncSession,
    query: str,
    options: SearchOptions,
) -> list[ScoredResult]:
    """Run hybrid vector + keyword search, merge, score, and filter."""
    # Run both search strategies
    vector_results = await _run_vector_search(db, query, options)
    keyword_results = await _run_keyword_search(db, query, options)

    # Merge and deduplicate
    merged = _merge_results(vector_results, keyword_results)

    # Apply scoring
    return _apply_scoring(merged, options.scope, options.active_project_id, query)


# ---------------------------------------------------------------------------
# Vector search (cosine similarity via pgvector)
# ---------------------------------------------------------------------------


async def _run_vector_search(
    db: AsyncSession, query: str, opts: SearchOptions
) -> list[RawResult]:
    """Cosine similarity search using pgvector."""
    query_embedding = generate_embedding(query)
    embedding_str = "[" + ",".join(str(e) for e in query_embedding) + "]"

    params: dict = {"emb": embedding_str, "threshold": opts.threshold}

    if opts.scope == "PROJECT" and opts.project_id:
        sql = """
            SELECT dc.id as chunk_id, dc.content, dc."pageNumber" as page_number,
                   dc."sectionRef" as section_ref, dc.metadata,
                   d.id as document_id, d.name as document_name, d.type as document_type,
                   d."projectId" as project_id, dc."createdAt" as created_at,
                   1 - (dc.embedding <=> CAST(:emb AS vector)) as similarity
            FROM "DocumentChunk" dc
            JOIN "Document" d ON dc."documentId" = d.id
            WHERE d."projectId" = :project_id
              AND d.status = 'READY'
              AND 1 - (dc.embedding <=> CAST(:emb AS vector)) > :threshold
            ORDER BY dc.embedding <=> CAST(:emb AS vector)
            LIMIT :limit
        """
        params["project_id"] = opts.project_id
    else:
        sql = """
            SELECT dc.id as chunk_id, dc.content, dc."pageNumber" as page_number,
                   dc."sectionRef" as section_ref, dc.metadata,
                   d.id as document_id, d.name as document_name, d.type as document_type,
                   d."projectId" as project_id, p.name as project_name,
                   dc."createdAt" as created_at,
                   1 - (dc.embedding <=> CAST(:emb AS vector)) as similarity
            FROM "DocumentChunk" dc
            JOIN "Document" d ON dc."documentId" = d.id
            JOIN "Project" p ON d."projectId" = p.id
            WHERE d.status = 'READY'
              AND 1 - (dc.embedding <=> CAST(:emb AS vector)) > :threshold
            ORDER BY dc.embedding <=> CAST(:emb AS vector)
            LIMIT :limit
        """

    params["limit"] = opts.limit

    # Document type filter
    if opts.document_types:
        sql = sql.replace(
            "ORDER BY",
            "AND d.type = ANY(CAST(:doc_types AS text[]))\n            ORDER BY",
        )
        params["doc_types"] = "{" + ",".join(opts.document_types) + "}"

    result = await db.execute(text(sql), params)
    rows = result.mappings().all()
    return [_row_to_raw(r) for r in rows]


# ---------------------------------------------------------------------------
# Keyword search (Postgres full-text search)
# ---------------------------------------------------------------------------


async def _run_keyword_search(
    db: AsyncSession, query: str, opts: SearchOptions
) -> list[RawResult]:
    """Full-text search using tsvector + websearch_to_tsquery."""
    words = [w for w in query.split() if len(w) >= 2]
    if not words:
        return []

    params: dict = {"query": query}

    if opts.scope == "PROJECT" and opts.project_id:
        sql = """
            SELECT dc.id as chunk_id, dc.content, dc."pageNumber" as page_number,
                   dc."sectionRef" as section_ref, dc.metadata,
                   d.id as document_id, d.name as document_name, d.type as document_type,
                   d."projectId" as project_id, dc."createdAt" as created_at,
                   ts_rank_cd(dc.search_vector, websearch_to_tsquery('english', :query)) as similarity
            FROM "DocumentChunk" dc
            JOIN "Document" d ON dc."documentId" = d.id
            WHERE d."projectId" = :project_id
              AND d.status = 'READY'
              AND dc.search_vector @@ websearch_to_tsquery('english', :query)
            ORDER BY ts_rank_cd(dc.search_vector, websearch_to_tsquery('english', :query)) DESC
            LIMIT :limit
        """
        params["project_id"] = opts.project_id
    else:
        sql = """
            SELECT dc.id as chunk_id, dc.content, dc."pageNumber" as page_number,
                   dc."sectionRef" as section_ref, dc.metadata,
                   d.id as document_id, d.name as document_name, d.type as document_type,
                   d."projectId" as project_id, p.name as project_name,
                   dc."createdAt" as created_at,
                   ts_rank_cd(dc.search_vector, websearch_to_tsquery('english', :query)) as similarity
            FROM "DocumentChunk" dc
            JOIN "Document" d ON dc."documentId" = d.id
            JOIN "Project" p ON d."projectId" = p.id
            WHERE d.status = 'READY'
              AND dc.search_vector @@ websearch_to_tsquery('english', :query)
            ORDER BY ts_rank_cd(dc.search_vector, websearch_to_tsquery('english', :query)) DESC
            LIMIT :limit
        """

    params["limit"] = opts.limit

    # Document type filter
    if opts.document_types:
        sql = sql.replace(
            "ORDER BY",
            "AND d.type = ANY(CAST(:doc_types AS text[]))\n            ORDER BY",
        )
        params["doc_types"] = "{" + ",".join(opts.document_types) + "}"

    result = await db.execute(text(sql), params)
    rows = result.mappings().all()
    results = [_row_to_raw(r) for r in rows]

    # Supplement: spec number exact match (tsvector may not handle "01 33 00")
    spec_match = re.search(r"\d{2}\s?\d{2}\s?\d{2}", query)
    if spec_match:
        spec_pattern = f"%{spec_match.group(0)}%"
        spec_params: dict = {"spec_pattern": spec_pattern, "limit": 5}

        if opts.scope == "PROJECT" and opts.project_id:
            spec_sql = """
                SELECT dc.id as chunk_id, dc.content, dc."pageNumber" as page_number,
                       dc."sectionRef" as section_ref, dc.metadata,
                       d.id as document_id, d.name as document_name, d.type as document_type,
                       d."projectId" as project_id, dc."createdAt" as created_at,
                       0.5 as similarity
                FROM "DocumentChunk" dc
                JOIN "Document" d ON dc."documentId" = d.id
                WHERE d."projectId" = :project_id
                  AND d.status = 'READY'
                  AND dc.content ILIKE :spec_pattern
                LIMIT :limit
            """
            spec_params["project_id"] = opts.project_id
        else:
            spec_sql = """
                SELECT dc.id as chunk_id, dc.content, dc."pageNumber" as page_number,
                       dc."sectionRef" as section_ref, dc.metadata,
                       d.id as document_id, d.name as document_name, d.type as document_type,
                       d."projectId" as project_id, p.name as project_name,
                       dc."createdAt" as created_at,
                       0.5 as similarity
                FROM "DocumentChunk" dc
                JOIN "Document" d ON dc."documentId" = d.id
                JOIN "Project" p ON d."projectId" = p.id
                WHERE d.status = 'READY'
                  AND dc.content ILIKE :spec_pattern
                LIMIT :limit
            """

        spec_result = await db.execute(text(spec_sql), spec_params)
        spec_rows = spec_result.mappings().all()
        existing_ids = {r.chunk_id for r in results}
        for row in spec_rows:
            raw = _row_to_raw(row)
            if raw.chunk_id not in existing_ids:
                results.append(raw)

    return results


# ---------------------------------------------------------------------------
# Merge & Score
# ---------------------------------------------------------------------------


def _merge_results(
    vector_results: list[RawResult],
    keyword_results: list[RawResult],
) -> list[RawResult]:
    """Merge vector and keyword results, deduplicating by chunk_id."""
    seen: dict[str, RawResult] = {}

    # Vector results take priority (cosine similarity 0-1)
    for r in vector_results:
        seen[r.chunk_id] = r

    # Normalize FTS scores to 0.3-0.7 range
    max_fts = max((float(r.similarity) for r in keyword_results), default=0.001)
    if max_fts <= 0:
        max_fts = 0.001

    for r in keyword_results:
        if r.chunk_id not in seen:
            normalized = 0.3 + (float(r.similarity) / max_fts) * 0.4
            r.similarity = normalized
            seen[r.chunk_id] = r
        else:
            # Both vector AND keyword — boost vector score by 10%
            existing = seen[r.chunk_id]
            existing.similarity = min(1.0, float(existing.similarity) * 1.1)

    return list(seen.values())


def _apply_scoring(
    results: list[RawResult],
    scope: str,
    active_project_id: str | None,
    query: str,
) -> list[ScoredResult]:
    """Apply type weights, recency, scope, and keyword boosts."""
    import time

    now = time.time()
    query_lower = query.lower()
    query_words = [w for w in query_lower.split() if len(w) >= 3]

    scored: list[ScoredResult] = []
    for r in results:
        base_score = float(r.similarity)

        # Keyword boost
        content_lower = r.content.lower()
        has_exact = query_lower in content_lower
        matching_words = [w for w in query_words if w in content_lower]
        word_ratio = len(matching_words) / len(query_words) if query_words else 0

        if has_exact:
            base_score = max(base_score, 0.70)
        elif word_ratio >= 0.5:
            base_score = max(base_score, 0.40 + word_ratio * 0.2)

        # Type weight
        type_weight = TYPE_WEIGHTS.get(r.document_type, 1.0)

        # Recency boost (within 30 days)
        if r.created_at:
            try:
                from datetime import datetime

                created = datetime.fromisoformat(str(r.created_at).replace("Z", "+00:00"))
                days_old = (datetime.now(tz=created.tzinfo) - created).days if created.tzinfo else (datetime.now() - created).days
            except Exception:
                days_old = 60
        else:
            days_old = 60
        recency_boost = 1.0 if days_old > 30 else 1.05 - (days_old / 30) * 0.05

        # Scope weight (cross-project: active project gets 1.2x)
        scope_weight = (
            1.2
            if scope == "CROSS_PROJECT" and active_project_id and r.project_id == active_project_id
            else 1.0
        )

        final_score = base_score * type_weight * recency_boost * scope_weight
        is_marginally = 0.15 <= base_score < 0.40

        scored.append(
            ScoredResult(
                chunk_id=r.chunk_id,
                content=r.content,
                page_number=r.page_number,
                section_ref=r.section_ref,
                metadata=r.metadata,
                document_id=r.document_id,
                document_name=r.document_name,
                document_type=r.document_type,
                project_id=r.project_id,
                project_name=r.project_name,
                similarity=base_score,
                created_at=r.created_at,
                final_score=final_score,
                is_marginally=is_marginally,
            )
        )

    return _apply_diversity_filter(scored)


def _apply_diversity_filter(results: list[ScoredResult]) -> list[ScoredResult]:
    """Limit chunks per document and per section; return top 10."""
    results.sort(key=lambda r: r.final_score, reverse=True)

    doc_counts: dict[str, int] = {}
    section_seen: set[str] = set()
    filtered: list[ScoredResult] = []

    for r in results:
        # Max 3 chunks per document
        count = doc_counts.get(r.document_id, 0)
        if count >= 3:
            continue

        # Max 1 chunk per section reference
        if r.section_ref:
            key = f"{r.document_id}:{r.section_ref}"
            if key in section_seen:
                continue
            section_seen.add(key)

        doc_counts[r.document_id] = count + 1
        filtered.append(r)

        if len(filtered) >= 10:
            break

    return filtered


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _row_to_raw(row) -> RawResult:
    """Convert a DB row mapping to a RawResult."""
    return RawResult(
        chunk_id=row["chunk_id"],
        content=row["content"],
        page_number=row.get("page_number"),
        section_ref=row.get("section_ref"),
        metadata=row.get("metadata"),
        document_id=row["document_id"],
        document_name=row["document_name"],
        document_type=row["document_type"],
        project_id=row["project_id"],
        project_name=row.get("project_name"),
        similarity=float(row["similarity"]),
        created_at=str(row["created_at"]) if row.get("created_at") else None,
    )
