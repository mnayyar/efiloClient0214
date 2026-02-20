"""OpenAI embedding service.

Uses text-embedding-3-large (1536 dimensions) for document chunk vectors.
"""

import openai

from app.config import get_settings

EMBEDDING_MODEL = "text-embedding-3-large"
EMBEDDING_DIMENSIONS = 1536
BATCH_SIZE = 2048  # OpenAI batch limit


def _get_client() -> openai.OpenAI:
    settings = get_settings()
    return openai.OpenAI(api_key=settings.openai_api_key)


def generate_embedding(text: str) -> list[float]:
    """Generate a single embedding vector."""
    client = _get_client()
    response = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=text,
        dimensions=EMBEDDING_DIMENSIONS,
    )
    return response.data[0].embedding


def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a batch of texts.

    Splits into batches of 2048 (OpenAI limit) and processes sequentially.
    """
    if not texts:
        return []

    client = _get_client()
    all_embeddings: list[list[float]] = []

    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        response = client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=batch,
            dimensions=EMBEDDING_DIMENSIONS,
        )
        # Sort by index to ensure correct ordering
        sorted_data = sorted(response.data, key=lambda x: x.index)
        all_embeddings.extend([item.embedding for item in sorted_data])

    return all_embeddings
