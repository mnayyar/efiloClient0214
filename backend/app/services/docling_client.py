"""Docling + Chonkie document parsing and semantic chunking.

Direct Python imports — no Docker sidecar needed.
Docling handles PDF/DOCX/image parsing with OCR and table preservation.
Chonkie handles semantic chunking with sentence-level embeddings.
"""

import logging
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

# Lazy-loaded singletons
_converter = None
_chunker = None
_available: bool | None = None


@dataclass
class DoclingChunk:
    content: str
    chunk_index: int
    page_number: int | None = None
    section_ref: str | None = None
    metadata: dict | None = None


@dataclass
class ParseAndChunkResponse:
    chunks: list[DoclingChunk]
    page_count: int
    parse_method: str
    chunk_method: str


@dataclass
class ParseResponse:
    markdown: str
    page_count: int
    parse_method: str


def _get_converter():
    """Lazy-init Docling DocumentConverter.

    OCR is disabled — Docling handles text-based PDFs (structure, tables,
    headings). For scanned/handwritten docs, the pipeline falls back to
    Claude Vision OCR which is more reliable on macOS.
    """
    global _converter
    if _converter is None:
        from docling.datamodel.pipeline_options import PdfPipelineOptions
        from docling.document_converter import DocumentConverter, PdfFormatOption

        pipeline_opts = PdfPipelineOptions(do_ocr=False)
        _converter = DocumentConverter(
            format_options={
                "pdf": PdfFormatOption(pipeline_options=pipeline_opts),
            }
        )
        logger.info("Docling DocumentConverter initialized (OCR disabled — Claude Vision handles scanned docs)")
    return _converter


def _get_chunker(chunk_size: int = 400, overlap: int = 50):
    """Lazy-init Chonkie SemanticChunker."""
    global _chunker
    if _chunker is None:
        from chonkie import SemanticChunker

        _chunker = SemanticChunker(
            model="minishlab/potion-base-32M",
            chunk_size=chunk_size,
            chunk_overlap=overlap,
        )
        logger.info("Chonkie SemanticChunker initialized (potion-base-32M)")
    return _chunker


def is_available() -> bool:
    """Check if Docling and Chonkie are importable."""
    global _available
    if _available is not None:
        return _available
    try:
        import docling  # noqa: F401
        import chonkie  # noqa: F401

        _available = True
        logger.info("Docling + Chonkie available (direct Python imports)")
    except ImportError as e:
        _available = False
        logger.warning("Docling/Chonkie not available: %s", e)
    return _available


# Regex patterns for metadata extraction
_SECTION_REF_RE = re.compile(
    r"(?:Section|Division|Part)\s+[\d]+(?:[.\- ]\d+)*", re.IGNORECASE
)
_SPEC_NUMBER_RE = re.compile(r"\d{2}\s?\d{2}\s?\d{2}")
_CAPITAL_TERMS_RE = re.compile(r"\b[A-Z][A-Z]+(?:\s+[A-Z][A-Z]+){0,3}\b")


def _extract_chunk_metadata(text: str) -> dict:
    """Extract headings, keywords, and section ref from chunk text."""
    # Section reference
    section_match = _SECTION_REF_RE.search(text)
    section_ref = section_match.group(0) if section_match else None

    # Headings (first 10 lines, short, uppercase or markdown)
    headings = []
    for line in text.split("\n")[:10]:
        line = line.strip()
        if not line or len(line) > 100:
            continue
        if line.isupper() or line.startswith("#") or re.match(r"^\d+[.)]\s", line):
            headings.append(line)
    headings = headings[:5]

    # Keywords
    keywords: set[str] = set()
    for m in _SPEC_NUMBER_RE.finditer(text):
        keywords.add(m.group(0))
    for m in _CAPITAL_TERMS_RE.finditer(text):
        term = m.group(0)
        if len(term) > 3:
            keywords.add(term)

    return {
        "headings": headings,
        "keywords": sorted(keywords)[:10],
        "sectionRef": section_ref,
    }


def _convert_buffer(file_buffer: bytes, filename: str) -> "docling.document.Document":
    """Write buffer to temp file and convert with Docling."""
    converter = _get_converter()

    suffix = Path(filename).suffix or ".pdf"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(file_buffer)
        tmp_path = tmp.name

    try:
        result = converter.convert(tmp_path)
        return result
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def parse_and_chunk(
    file_buffer: bytes,
    filename: str,
    mime_type: str,
    *,
    chunk_size: int = 400,
    overlap: int = 50,
) -> ParseAndChunkResponse:
    """Parse a document with Docling and chunk with Chonkie."""
    # Parse with Docling
    result = _convert_buffer(file_buffer, filename)
    markdown = result.document.export_to_markdown()
    num_pages_attr = getattr(result.document, "num_pages", None)
    page_count = num_pages_attr() if callable(num_pages_attr) else (num_pages_attr or 0)

    if not markdown or not markdown.strip():
        return ParseAndChunkResponse(
            chunks=[], page_count=page_count,
            parse_method="docling", chunk_method="chonkie",
        )

    # Chunk with Chonkie
    chunker = _get_chunker(chunk_size, overlap)
    raw_chunks = chunker.chunk(markdown)

    chunks: list[DoclingChunk] = []
    for i, raw_chunk in enumerate(raw_chunks):
        text = raw_chunk.text if hasattr(raw_chunk, "text") else str(raw_chunk)
        if not text.strip():
            continue

        meta = _extract_chunk_metadata(text)
        chunks.append(
            DoclingChunk(
                content=text.strip(),
                chunk_index=i,
                page_number=None,  # Chonkie doesn't track pages
                section_ref=meta.get("sectionRef"),
                metadata={"headings": meta["headings"], "keywords": meta["keywords"]},
            )
        )

    return ParseAndChunkResponse(
        chunks=chunks,
        page_count=page_count,
        parse_method="docling",
        chunk_method="chonkie",
    )


def parse_only(
    file_buffer: bytes, filename: str, mime_type: str
) -> ParseResponse:
    """Parse a document with Docling and return full markdown (no chunking)."""
    result = _convert_buffer(file_buffer, filename)
    markdown = result.document.export_to_markdown()
    num_pages_attr = getattr(result.document, "num_pages", None)
    page_count = num_pages_attr() if callable(num_pages_attr) else (num_pages_attr or 0)

    return ParseResponse(
        markdown=markdown,
        page_count=page_count,
        parse_method="docling",
    )
