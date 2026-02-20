"""Async and sync SQLAlchemy engine and session factories."""

import re
import ssl
from collections.abc import AsyncGenerator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings

settings = get_settings()

# Convert postgres:// to postgresql+asyncpg:// for async driver
_db_url = settings.database_url
if _db_url.startswith("postgres://"):
    _db_url = _db_url.replace("postgres://", "postgresql+asyncpg://", 1)
elif _db_url.startswith("postgresql://"):
    _db_url = _db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

# Strip sslmode from query string — asyncpg uses 'ssl' param instead
if "sslmode=" in _db_url:
    _db_url = re.sub(r"[?&]sslmode=[^&]*", "", _db_url)
    # Fix dangling ? or &
    _db_url = _db_url.rstrip("?&")

# Build SSL context for remote Postgres (Neon, Render, AWS RDS, etc.)
_connect_args: dict = {}
_needs_ssl = "neon.tech" in settings.database_url or "render.com" in settings.database_url or "sslmode=" in settings.database_url
if _needs_ssl:
    _ssl_ctx = ssl.create_default_context()
    try:
        import certifi
        _ssl_ctx.load_verify_locations(certifi.where())
    except (ImportError, Exception):
        if settings.is_development:
            _ssl_ctx.check_hostname = False
            _ssl_ctx.verify_mode = ssl.CERT_NONE
    _connect_args["ssl"] = _ssl_ctx

engine = create_async_engine(
    _db_url,
    echo=settings.is_development,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    connect_args=_connect_args,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yield an async DB session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ---------------------------------------------------------------------------
# Synchronous engine + session (for Celery tasks)
# ---------------------------------------------------------------------------

_sync_db_url = settings.database_url
if _sync_db_url.startswith("postgres://"):
    _sync_db_url = _sync_db_url.replace("postgres://", "postgresql+psycopg2://", 1)
elif _sync_db_url.startswith("postgresql://"):
    _sync_db_url = _sync_db_url.replace("postgresql://", "postgresql+psycopg2://", 1)

# Strip sslmode for consistency (psycopg2 handles it via connect_args)
if "sslmode=" in _sync_db_url:
    _sync_db_url = re.sub(r"[?&]sslmode=[^&]*", "", _sync_db_url)
    _sync_db_url = _sync_db_url.rstrip("?&")

_sync_connect_args: dict = {}
if _needs_ssl:
    try:
        import certifi
        _sync_connect_args["sslmode"] = "verify-full"
        _sync_connect_args["sslrootcert"] = certifi.where()
    except ImportError:
        _sync_connect_args["sslmode"] = "require"

sync_engine = create_engine(
    _sync_db_url,
    echo=False,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    connect_args=_sync_connect_args,
)

sync_session_factory = sessionmaker(
    sync_engine,
    class_=Session,
    expire_on_commit=False,
)
