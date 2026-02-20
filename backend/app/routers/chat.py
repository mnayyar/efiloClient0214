"""Chat API route with SSE streaming.

POST /api/chat — Chat with documents (SSE or JSON).
  Accepts: text/event-stream (SSE) or application/json (full response).
  Pipeline: classify → search → rank → generate answer → suggest prompts.
"""

import json
import logging
import time
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.helpers import generate_cuid
from app.models.notification import AuditLog
from app.models.project import Project
from app.models.search import ChatSession, SearchAnalytics, SearchQuery
from app.models.user import User
from app.schemas.search import ChatRequest
from app.services.ai import generate_web_search_response
from app.services.search_orchestration import (
    classify_query,
    generate_search_answer,
    generate_suggested_prompts,
    group_by_document,
    search_and_rank,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])


def _format_sse(data: dict) -> str:
    """Format dict as an SSE data line."""
    return f"data: {json.dumps(data)}\n\n"


# ---------------------------------------------------------------------------
# POST /api/chat
# ---------------------------------------------------------------------------


@router.post("/chat")
async def chat(
    request: Request,
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Chat endpoint — returns SSE stream or JSON based on Accept header."""
    # Verify project exists
    result = await db.execute(select(Project).where(Project.id == body.project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get or create chat session
    if body.session_id:
        result = await db.execute(
            select(ChatSession).where(
                ChatSession.id == body.session_id,
                ChatSession.user_id == user.id,
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        session = ChatSession(
            user_id=user.id,
            project_id=body.project_id,
            title=body.query[:100],
            messages=[],
        )
        db.add(session)
        await db.flush()

    accept = request.headers.get("accept", "")
    if "text/event-stream" in accept:
        return StreamingResponse(
            _stream_response(db, body, project, user, session),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
        )

    return await _json_response(db, body, project, user, session)


# ---------------------------------------------------------------------------
# SSE Streaming Response
# ---------------------------------------------------------------------------


async def _stream_response(
    db: AsyncSession,
    body: ChatRequest,
    project: Project,
    user: User,
    session: ChatSession,
) -> AsyncIterator[str]:
    """Generate SSE events: status → classification → sources → answer → suggestions → done."""
    start = time.monotonic()

    try:
        # ── WORLD scope: web search ──
        if body.scope == "WORLD":
            yield _format_sse({"type": "status", "message": "Searching the web..."})

            web_result = generate_web_search_response(body.query)

            yield _format_sse({
                "type": "answer",
                "data": {
                    "response": web_result.content,
                    "webCitations": [{"url": c.url, "title": c.title} for c in web_result.citations],
                },
            })

            # Save messages
            messages = list(session.messages or [])
            assistant_msg_id = generate_cuid()
            messages.append({
                "id": generate_cuid(), "role": "user",
                "content": body.query, "timestamp": _now_iso(),
            })
            messages.append({
                "id": assistant_msg_id, "role": "assistant",
                "content": web_result.content, "scope": "WORLD",
                "webCitations": [{"url": c.url, "title": c.title} for c in web_result.citations],
                "timestamp": _now_iso(),
            })
            session.messages = messages
            await db.flush()

            search_time_ms = int((time.monotonic() - start) * 1000)

            # Log analytics (non-blocking — failures don't break response)
            try:
                await _log_analytics(
                    db, user.id, body.query, "WORLD", project.id,
                    len(web_result.citations), search_time_ms,
                    web_result.tokens_used.get("input", 0) + web_result.tokens_used.get("output", 0),
                )
            except Exception:
                logger.warning("Analytics logging failed (non-fatal)")

            yield _format_sse({
                "type": "done",
                "data": {"sessionId": session.id, "messageId": assistant_msg_id, "searchTimeMs": search_time_ms},
            })
            return

        # ── PROJECT / CROSS_PROJECT ──

        # 1. Classify
        yield _format_sse({"type": "status", "message": "Classifying query..."})
        classification = classify_query(body.query, project.id, project.name)
        scope = body.scope or classification.scope

        yield _format_sse({
            "type": "classification",
            "data": {"scope": scope, "intent": classification.intent},
        })

        doc_types = (
            body.document_types
            if body.document_types
            else classification.document_types if classification.document_types
            else None
        )

        # 2. Search
        yield _format_sse({"type": "status", "message": "Searching documents..."})
        chunks = await search_and_rank(
            db, body.query, project.id,
            scope=scope,
            document_types=doc_types,
            active_project_id=project.id,
        )

        # Send sources immediately
        sources = [
            {
                "index": i + 1,
                "documentId": c.document_id,
                "documentName": c.document_name,
                "documentType": c.document_type,
                "pageNumber": c.page_number,
                "sectionRef": c.section_ref,
                "chunkId": c.chunk_id,
            }
            for i, c in enumerate(chunks)
        ]
        yield _format_sse({"type": "sources", "data": sources})

        # 3. Generate answer
        yield _format_sse({"type": "status", "message": "Generating answer..."})
        answer = generate_search_answer(
            body.query, chunks, project.name, scope, body.user_role,
        )

        yield _format_sse({
            "type": "answer",
            "data": {
                "response": answer["response"],
                "confidence": answer["confidence"],
                "alerts": answer["alerts"],
            },
        })

        # 4. Suggested prompts
        suggested = generate_suggested_prompts(
            body.query, chunks, project.name, scope, body.user_role,
        )
        yield _format_sse({"type": "suggestions", "data": suggested})

        # 5. Save session messages
        messages = list(session.messages or [])
        assistant_msg_id = generate_cuid()
        messages.append({
            "id": generate_cuid(), "role": "user",
            "content": body.query, "timestamp": _now_iso(),
        })
        messages.append({
            "id": assistant_msg_id, "role": "assistant",
            "content": answer["response"],
            "sources": answer["sources"],
            "scope": scope,
            "confidence": answer["confidence"],
            "alerts": answer["alerts"],
            "timestamp": _now_iso(),
        })
        session.messages = messages
        await db.flush()

        search_time_ms = int((time.monotonic() - start) * 1000)

        # 6. Log analytics
        try:
            tokens = answer["tokens_used"]
            await _log_analytics(
                db, user.id, body.query, scope, project.id,
                len(chunks), search_time_ms,
                tokens.get("input", 0) + tokens.get("output", 0),
            )
        except Exception:
            logger.warning("Analytics logging failed (non-fatal)")

        yield _format_sse({
            "type": "done",
            "data": {"sessionId": session.id, "messageId": assistant_msg_id, "searchTimeMs": search_time_ms},
        })

    except Exception as exc:
        logger.exception("Chat streaming error")
        yield _format_sse({"type": "error", "message": str(exc)})


# ---------------------------------------------------------------------------
# JSON (non-streaming) Response
# ---------------------------------------------------------------------------


async def _json_response(
    db: AsyncSession,
    body: ChatRequest,
    project: Project,
    user: User,
    session: ChatSession,
) -> dict:
    """Full pipeline, return complete JSON."""
    start = time.monotonic()

    # ── WORLD scope ──
    if body.scope == "WORLD":
        web_result = generate_web_search_response(body.query)
        search_time_ms = int((time.monotonic() - start) * 1000)

        messages = list(session.messages or [])
        assistant_msg_id = generate_cuid()
        messages.append({"id": generate_cuid(), "role": "user", "content": body.query, "timestamp": _now_iso()})
        messages.append({
            "id": assistant_msg_id, "role": "assistant",
            "content": web_result.content, "scope": "WORLD",
            "webCitations": [{"url": c.url, "title": c.title} for c in web_result.citations],
            "timestamp": _now_iso(),
        })
        session.messages = messages
        await db.flush()

        await _log_analytics(
            db, user.id, body.query, "WORLD", project.id,
            len(web_result.citations), search_time_ms,
            web_result.tokens_used.get("input", 0) + web_result.tokens_used.get("output", 0),
        )

        return {
            "data": {
                "response": web_result.content,
                "webCitations": [{"url": c.url, "title": c.title} for c in web_result.citations],
                "scope": "WORLD",
                "searchTimeMs": search_time_ms,
                "sessionId": session.id,
                "messageId": assistant_msg_id,
            }
        }

    # ── PROJECT / CROSS_PROJECT ──
    classification = classify_query(body.query, project.id, project.name)
    scope = body.scope or classification.scope

    doc_types = (
        body.document_types
        if body.document_types
        else classification.document_types if classification.document_types
        else None
    )

    chunks = await search_and_rank(
        db, body.query, project.id,
        scope=scope,
        document_types=doc_types,
        active_project_id=project.id,
    )

    answer = generate_search_answer(
        body.query, chunks, project.name, scope, body.user_role,
    )

    suggested = generate_suggested_prompts(
        body.query, chunks, project.name, scope, body.user_role,
    )

    search_time_ms = int((time.monotonic() - start) * 1000)

    # Save messages
    messages = list(session.messages or [])
    assistant_msg_id = generate_cuid()
    messages.append({"id": generate_cuid(), "role": "user", "content": body.query, "timestamp": _now_iso()})
    messages.append({
        "id": assistant_msg_id, "role": "assistant",
        "content": answer["response"],
        "sources": answer["sources"],
        "scope": scope,
        "confidence": answer["confidence"],
        "alerts": answer["alerts"],
        "timestamp": _now_iso(),
    })
    session.messages = messages
    await db.flush()

    await _log_analytics(
        db, user.id, body.query, scope, project.id,
        len(chunks), search_time_ms,
        answer["tokens_used"].get("input", 0) + answer["tokens_used"].get("output", 0),
    )

    return {
        "data": {
            "response": answer["response"],
            "sources": answer["sources"],
            "scope": scope,
            "searchTimeMs": search_time_ms,
            "confidence": answer["confidence"],
            "suggestedPrompts": suggested,
            "alerts": answer["alerts"],
            "sessionId": session.id,
            "messageId": assistant_msg_id,
        }
    }


# ---------------------------------------------------------------------------
# Analytics / Helpers
# ---------------------------------------------------------------------------


async def _log_analytics(
    db: AsyncSession,
    user_id: str,
    query: str,
    scope: str,
    project_id: str,
    result_count: int,
    search_time_ms: int,
    token_count: int | None = None,
) -> None:
    """Log search query, analytics, and audit log."""
    sq = SearchQuery(
        user_id=user_id,
        project_id=project_id,
        query=query,
        scope=scope,
        response_time=search_time_ms,
        token_count=token_count,
    )
    db.add(sq)
    await db.flush()

    sa = SearchAnalytics(
        query_id=sq.id,
        user_id=user_id,
        search_term=query,
        scope=scope,
        result_count=result_count,
    )
    db.add(sa)

    al = AuditLog(
        user_id=user_id,
        action="SEARCH",
        entity_type="SearchQuery",
        entity_id=sq.id,
        project_id=project_id,
        details={"query": query, "scope": scope, "resultCount": result_count, "searchTimeMs": search_time_ms},
    )
    db.add(al)
    await db.flush()


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# GET /api/chat/sessions
# ---------------------------------------------------------------------------


@router.get("/chat/sessions")
async def list_sessions(
    request: Request,
    project_id: str | None = None,
    include_archived: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List chat sessions for the authenticated user."""
    from sqlalchemy import and_

    conditions = [ChatSession.user_id == user.id]
    if project_id:
        conditions.append(ChatSession.project_id == project_id)
    if not include_archived:
        conditions.append(ChatSession.is_archived == False)

    result = await db.execute(
        select(ChatSession)
        .where(and_(*conditions))
        .order_by(ChatSession.updated_at.desc())
        .limit(50)
    )
    sessions = result.scalars().all()

    return {
        "data": [
            {
                "id": s.id,
                "title": s.title,
                "projectId": s.project_id,
                "isArchived": s.is_archived,
                "createdAt": s.created_at.isoformat() if s.created_at else None,
                "updatedAt": s.updated_at.isoformat() if s.updated_at else None,
            }
            for s in sessions
        ]
    }


# ---------------------------------------------------------------------------
# GET /api/chat/sessions/{session_id}
# ---------------------------------------------------------------------------


@router.get("/chat/sessions/{session_id}")
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get a single chat session with messages."""
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "data": {
            "id": session.id,
            "title": session.title,
            "projectId": session.project_id,
            "messages": session.messages,
            "isArchived": session.is_archived,
            "createdAt": session.created_at.isoformat() if session.created_at else None,
            "updatedAt": session.updated_at.isoformat() if session.updated_at else None,
        }
    }


# ---------------------------------------------------------------------------
# DELETE /api/chat/sessions/{session_id}
# ---------------------------------------------------------------------------


@router.delete("/chat/sessions/{session_id}")
async def archive_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Archive (soft-delete) a chat session."""
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.is_archived = True
    await db.commit()
    return {"data": {"archived": True}}
