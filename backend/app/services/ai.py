"""Claude AI service wrapper.

All reasoning, analysis, and vision/OCR calls go through this module.
Includes web search via Claude's beta web_search tool.
"""

import logging
import time
from dataclasses import dataclass, field

import anthropic

from app.config import get_settings

logger = logging.getLogger(__name__)

MODEL_MAP = {
    "haiku": "claude-haiku-4-5-20251001",
    "sonnet": "claude-sonnet-4-5-20250929",
    "opus": "claude-opus-4-5-20250620",
}


@dataclass
class AIResponse:
    content: str
    tokens_used: dict  # { "input": int, "output": int }
    model: str
    latency_ms: int


@dataclass
class ImageInput:
    base64: str
    media_type: str  # "image/png", "image/jpeg", "image/webp"


def _get_client() -> anthropic.Anthropic:
    settings = get_settings()
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


def generate_response(
    *,
    system_prompt: str,
    user_prompt: str,
    model: str = "sonnet",
    max_tokens: int = 2000,
    temperature: float = 0.3,
    images: list[ImageInput] | None = None,
) -> AIResponse:
    """Generate a Claude response.

    Args:
        system_prompt: System instructions.
        user_prompt: User message text.
        model: One of "haiku", "sonnet", "opus".
        max_tokens: Maximum output tokens.
        temperature: Sampling temperature.
        images: Optional list of base64-encoded images.
    """
    client = _get_client()
    model_id = MODEL_MAP.get(model, MODEL_MAP["sonnet"])

    # Build message content
    if images:
        content: list[dict] = []
        for img in images:
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": img.media_type,
                    "data": img.base64,
                },
            })
        content.append({"type": "text", "text": user_prompt})
    else:
        content = user_prompt  # type: ignore[assignment]

    start = time.monotonic()
    response = client.messages.create(
        model=model_id,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system_prompt,
        messages=[{"role": "user", "content": content}],
    )
    latency_ms = int((time.monotonic() - start) * 1000)

    text = ""
    if response.content and response.content[0].type == "text":
        text = response.content[0].text

    return AIResponse(
        content=text,
        tokens_used={
            "input": response.usage.input_tokens,
            "output": response.usage.output_tokens,
        },
        model=model_id,
        latency_ms=latency_ms,
    )


# ---------------------------------------------------------------------------
# Web Search (Claude beta tool)
# ---------------------------------------------------------------------------


@dataclass
class WebCitation:
    url: str
    title: str


@dataclass
class WebSearchResponse:
    content: str
    citations: list[WebCitation] = field(default_factory=list)
    tokens_used: dict = field(default_factory=lambda: {"input": 0, "output": 0})
    model: str = ""
    latency_ms: int = 0


def generate_web_search_response(
    query: str,
    conversation_history: list[dict] | None = None,
) -> WebSearchResponse:
    """Generate an answer using Claude's web search tool (beta).

    Args:
        query: The user's question.
        conversation_history: Optional list of {"role": ..., "content": ...} dicts.
    """
    client = _get_client()
    model_id = MODEL_MAP["sonnet"]

    messages: list[dict] = []
    if conversation_history:
        messages.extend(conversation_history)
    messages.append({"role": "user", "content": query})

    start = time.monotonic()

    response = client.beta.messages.create(
        model=model_id,
        max_tokens=4096,
        temperature=0.3,
        system=(
            "You are a knowledgeable assistant for construction professionals (MEP contractors). "
            "Answer questions using current web information. Be concise and practical. "
            "Always cite the web sources you used in your answer."
        ),
        messages=messages,
        tools=[{"type": "web_search_20250305", "name": "web_search"}],
    )

    latency_ms = int((time.monotonic() - start) * 1000)

    content = ""
    citations: list[WebCitation] = []
    seen_urls: set[str] = set()

    for block in response.content:
        if block.type == "text":
            content += block.text
        elif block.type == "web_search_tool_result":
            for result in getattr(block, "content", []) or []:
                url = getattr(result, "url", None)
                if result.type == "web_search_result" and url and url not in seen_urls:
                    seen_urls.add(url)
                    citations.append(
                        WebCitation(url=url, title=getattr(result, "title", url))
                    )

    return WebSearchResponse(
        content=content,
        citations=citations,
        tokens_used={
            "input": response.usage.input_tokens,
            "output": response.usage.output_tokens,
        },
        model=model_id,
        latency_ms=latency_ms,
    )
