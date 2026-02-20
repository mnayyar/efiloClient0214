"""Document ingestion Celery task.

7-step pipeline: download → parse/chunk → embed → store vectors → finalize
  → (optional) compliance clause parsing for CONTRACT documents.
"""

import logging

import redis
from celery import shared_task
from sqlalchemy import select, text

from app.config import get_settings
from app.db.session import sync_session_factory
from app.models.document import Document, DocumentChunk
from app.models.enums import DocumentStatus, DocumentType
from app.models.helpers import generate_cuid
from app.services import docling_client
from app.services.document_processing import (
    Chunk,
    extract_text,
    semantic_chunk,
)
from app.services.embeddings import generate_embeddings
from app.services.r2 import download_from_r2
from app.services.vision import extract_via_vision

logger = logging.getLogger(__name__)

_redis = redis.from_url(get_settings().redis_url)

# Redis key prefix for tracking Docling crash attempts per document.
# When SIGABRT kills the worker, self.request.retries stays at 0 because
# self.retry() never executes. We use Redis to persist the attempt count
# across process crashes so subsequent requeues know to skip Docling.
_DOCLING_ATTEMPT_KEY = "docling_attempt:{doc_id}"
_DOCLING_MAX_ATTEMPTS = 1  # Try Docling once; skip on requeue after crash


@shared_task(
    name="document.ingest",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    acks_late=True,
    reject_on_worker_lost=True,
)
def ingest_document(self, document_id: str, project_id: str) -> dict:
    """Full document ingestion pipeline.

    Steps:
      1. Download from R2
      2. Parse and chunk (Docling → local fallback → Vision OCR)
      3. Generate embeddings (OpenAI)
      4. Store vectors + chunks in DB
      5. Finalize (mark READY)
      6. Parse compliance clauses (CONTRACT docs only)

    On crash recovery (SIGABRT from Docling), a Redis counter tracks
    prior attempts so the requeued task skips Docling automatically.
    """
    # Check Redis for prior Docling crash attempts
    attempt_key = _DOCLING_ATTEMPT_KEY.format(doc_id=document_id)
    prior_attempts = int(_redis.get(attempt_key) or 0)
    skip_docling = prior_attempts >= _DOCLING_MAX_ATTEMPTS

    if skip_docling:
        logger.info(
            "Docling attempted %d time(s) for document %s — skipping, using local + Vision",
            prior_attempts, document_id,
        )

    # Increment the attempt counter BEFORE calling Docling (in case of SIGABRT)
    if not skip_docling:
        _redis.set(attempt_key, prior_attempts + 1, ex=3600)  # 1hr TTL

    try:
        result = _run_pipeline(document_id, project_id, skip_docling=skip_docling)
        # Success — clean up the attempt counter
        _redis.delete(attempt_key)
        return result
    except Exception as exc:
        logger.exception("Ingestion failed for document %s", document_id)
        # Mark as ERROR on final failure
        if self.request.retries >= self.max_retries:
            _mark_error(document_id)
            _redis.delete(attempt_key)
        raise self.retry(exc=exc)


def _run_pipeline(document_id: str, project_id: str, *, skip_docling: bool = False) -> dict:
    """Execute the ingestion pipeline steps."""

    # --- Step 1: Download from R2 ---
    logger.info("Step 1: Downloading document %s", document_id)
    with sync_session_factory() as session:
        result = session.execute(
            select(Document).where(Document.id == document_id)
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise ValueError(f"Document {document_id} not found")
        r2_key = doc.r2_key
        mime_type = doc.mime_type
        filename = doc.name
        doc_type = doc.type

    file_buffer = download_from_r2(r2_key)
    logger.info("Downloaded %d bytes from R2", len(file_buffer))

    # --- Step 2-3: Parse and Chunk ---
    logger.info("Step 2: Parsing and chunking")
    chunks, page_count, parse_method, extracted_text = _parse_and_chunk(
        file_buffer, filename, mime_type, skip_docling=skip_docling
    )

    if not chunks:
        logger.warning("No text extracted from document %s — marking ERROR", document_id)
        _mark_error(document_id)
        return {"documentId": document_id, "chunksCreated": 0, "parseMethod": parse_method}

    logger.info(
        "Parsed %d chunks (pageCount=%s, method=%s)", len(chunks), page_count, parse_method
    )

    # --- Step 3: Generate Embeddings ---
    logger.info("Step 3: Generating embeddings for %d chunks", len(chunks))
    texts = [c.content for c in chunks]
    embeddings = generate_embeddings(texts)
    logger.info("Generated %d embeddings", len(embeddings))

    # --- Step 4: Store Vectors and Chunks ---
    logger.info("Step 4: Storing chunks and vectors")
    _store_chunks(document_id, chunks, embeddings)

    # --- Step 5: Finalize ---
    logger.info("Step 5: Finalizing document %s", document_id)
    _finalize_document(document_id, page_count)

    # --- Step 6: Compliance Clause Parsing (CONTRACT only) ---
    if doc_type == DocumentType.CONTRACT and extracted_text and len(extracted_text.strip()) >= 100:
        logger.info("Step 6: Parsing compliance clauses for CONTRACT document")
        try:
            _parse_compliance_clauses(project_id, document_id, extracted_text)
        except Exception:
            logger.exception("Compliance parsing failed for %s (non-fatal)", document_id)

    return {
        "documentId": document_id,
        "chunksCreated": len(chunks),
        "parseMethod": parse_method,
    }


def _parse_and_chunk(
    file_buffer: bytes, filename: str, mime_type: str, *, skip_docling: bool = False
) -> tuple[list[Chunk], int | None, str, str]:
    """Parse document and return chunks.

    Returns: (chunks, page_count, method, extracted_text)
    """
    # Try Docling first (handles text-based PDFs with structure preservation)
    if not skip_docling and docling_client.is_available():
        try:
            result = docling_client.parse_and_chunk(
                file_buffer, filename, mime_type, chunk_size=400, overlap=50
            )
            if result.chunks:
                chunks = [
                    Chunk(
                        content=c.content,
                        chunk_index=c.chunk_index,
                        page_number=c.page_number,
                        section_ref=c.section_ref,
                        metadata=c.metadata or {"headings": [], "keywords": []},
                    )
                    for c in result.chunks
                ]
                extracted = "\n\n".join(c.content for c in chunks)
                return chunks, result.page_count, "docling", extracted
            else:
                # Docling returned no chunks — likely a scanned/image PDF
                logger.info("Docling returned no text — trying Claude Vision OCR")
        except Exception:
            logger.warning("Docling failed, falling back to local extraction")

    # Local extraction fallback (pymupdf)
    extraction = extract_text(file_buffer, mime_type)

    # Claude Vision OCR for scanned/handwritten documents
    if extraction.is_scanned or not extraction.text.strip():
        logger.info("Scanned/empty document detected — using Claude Vision OCR")
        vision_results = extract_via_vision(file_buffer, extraction.page_count or 1)
        if vision_results:
            extraction.text = "\n\n".join(r["text"] for r in vision_results)
            method = "vision"
        else:
            method = "local"
    else:
        method = "local"

    if not extraction.text.strip():
        return [], extraction.page_count, method, ""

    chunks = semantic_chunk(
        extraction.text, target_tokens=400, overlap=50
    )
    return chunks, extraction.page_count, method, extraction.text


def _store_chunks(
    document_id: str,
    chunks: list[Chunk],
    embeddings: list[list[float]],
) -> None:
    """Create DocumentChunk records and set embedding + search_vector via raw SQL."""
    with sync_session_factory() as session:
        for chunk, embedding in zip(chunks, embeddings):
            chunk_id = generate_cuid()

            # Create chunk record
            db_chunk = DocumentChunk(
                id=chunk_id,
                document_id=document_id,
                content=chunk.content,
                chunk_index=chunk.chunk_index,
                page_number=chunk.page_number,
                section_ref=chunk.section_ref,
                metadata_=chunk.metadata,
            )
            session.add(db_chunk)
            session.flush()

            # Set embedding and search_vector via raw SQL
            embedding_str = "[" + ",".join(str(e) for e in embedding) + "]"
            session.execute(
                text(
                    'UPDATE "DocumentChunk" '
                    "SET embedding = CAST(:emb AS vector), "
                    "    search_vector = to_tsvector('english', :content) "
                    "WHERE id = :id"
                ),
                {"emb": embedding_str, "content": chunk.content, "id": chunk_id},
            )

        session.commit()


def _finalize_document(document_id: str, page_count: int | None) -> None:
    """Mark document as READY and set page count."""
    with sync_session_factory() as session:
        result = session.execute(
            select(Document).where(Document.id == document_id)
        )
        doc = result.scalar_one_or_none()
        if doc:
            doc.status = DocumentStatus.READY
            if page_count is not None:
                doc.page_count = page_count
            session.commit()


def _mark_error(document_id: str) -> None:
    """Mark document as ERROR."""
    try:
        with sync_session_factory() as session:
            result = session.execute(
                select(Document).where(Document.id == document_id)
            )
            doc = result.scalar_one_or_none()
            if doc:
                doc.status = DocumentStatus.ERROR
                session.commit()
    except Exception:
        logger.exception("Failed to mark document %s as ERROR", document_id)


def _parse_compliance_clauses(
    project_id: str, document_id: str, contract_text: str
) -> None:
    """Parse compliance clauses from a CONTRACT document.

    Imports compliance parser lazily to avoid circular deps.
    """
    # Check if clauses already exist (idempotency)
    from app.models.compliance import ContractClause

    with sync_session_factory() as session:
        result = session.execute(
            select(ContractClause).where(
                ContractClause.source_doc_id == document_id
            ).limit(1)
        )
        if result.scalar_one_or_none():
            logger.info("Clauses already exist for document %s — skipping", document_id)
            return

    # Import and call the compliance parser
    try:
        from app.services.compliance.parser import parse_contract

        parse_contract(
            project_id=project_id,
            document_id=document_id,
            contract_text=contract_text,
        )
    except ImportError:
        logger.warning("Compliance parser not yet implemented — skipping")
    except Exception:
        logger.exception("Compliance clause parsing failed for %s", document_id)
