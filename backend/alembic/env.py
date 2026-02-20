"""Alembic environment configuration for async SQLAlchemy."""

import asyncio
import sys
from logging.config import fileConfig
from pathlib import Path

# Add backend dir to sys.path so 'app' package is importable
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

# Load dotenv before anything else
from dotenv import load_dotenv

load_dotenv(str(Path(__file__).resolve().parents[2] / ".env.local"))

from app.config import get_settings
from app.db.base import Base

# Import all models so they register with Base.metadata
import app.models  # noqa: F401

config = context.config
settings = get_settings()

# Override sqlalchemy.url from env
db_url = settings.database_url
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
elif db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

# Strip sslmode — asyncpg uses ssl param
import re

db_url = re.sub(r"[?&]sslmode=[^&]*", "", db_url).rstrip("?&")

config.set_main_option("sqlalchemy.url", db_url)

# Build SSL context for Neon
import ssl as _ssl

_connect_args: dict = {}
if "neon.tech" in settings.database_url:
    _ssl_ctx = _ssl.create_default_context()
    try:
        import certifi
        _ssl_ctx.load_verify_locations(certifi.where())
    except (ImportError, Exception):
        if settings.is_development:
            _ssl_ctx.check_hostname = False
            _ssl_ctx.verify_mode = _ssl.CERT_NONE
    _connect_args["ssl"] = _ssl_ctx

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _include_object(object, name, type_, reflected, compare_to):
    """Filter objects from autogenerate comparison.

    - Exclude the Prisma migrations table (_prisma_migrations)
    - Exclude the embedding and search_vector columns on DocumentChunk
      (managed via raw SQL migrations, not Alembic)
    """
    if type_ == "table" and name == "_prisma_migrations":
        return False
    if type_ == "column" and name in ("embedding", "search_vector"):
        return False
    return True


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (generate SQL)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=_include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=_include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations in 'online' mode with async engine."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=_connect_args,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
