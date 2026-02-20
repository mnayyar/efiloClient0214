"""Claude Vision OCR service for scanned documents."""

import base64
import io
import logging

from PIL import Image

from app.services.ai import ImageInput, generate_response

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a construction document text extraction assistant. "
    "Extract text accurately, preserving structure."
)

USER_PROMPT = (
    "Extract all text from this construction document page. "
    "Include handwritten notes, stamps, labels, dimensions, and any visible text. "
    "Preserve structure (headers, tables, lists). Return plain text."
)


def _buffer_to_png_base64(buffer: bytes, max_dim: int = 2048) -> str:
    """Convert image/PDF buffer to resized PNG base64."""
    img = Image.open(io.BytesIO(buffer))
    img.thumbnail((max_dim, max_dim), Image.LANCZOS)

    if img.mode != "RGB":
        img = img.convert("RGB")

    png_buf = io.BytesIO()
    img.save(png_buf, format="PNG")
    png_buf.seek(0)
    return base64.b64encode(png_buf.read()).decode("utf-8")


def extract_via_vision(
    buffer: bytes, page_count: int = 1
) -> list[dict]:
    """Extract text from scanned document using Claude Vision.

    Returns list of { "pageNumber": int, "text": str }.
    """
    try:
        b64 = _buffer_to_png_base64(buffer)
    except Exception:
        logger.warning("Failed to convert buffer to PNG for vision OCR")
        return []

    max_tokens = 4000 * min(page_count, 5)

    result = generate_response(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=USER_PROMPT,
        model="sonnet",
        max_tokens=max_tokens,
        temperature=0.1,
        images=[ImageInput(base64=b64, media_type="image/png")],
    )

    return [{"pageNumber": 1, "text": result.content}]
