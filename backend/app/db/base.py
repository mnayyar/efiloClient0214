"""SQLAlchemy declarative base for all models."""

import sqlalchemy as sa
from sqlalchemy.orm import DeclarativeBase

# Naming convention that matches Prisma-generated constraint names:
# - FKs: {table}_{column}_fkey  (e.g., ActionItem_projectId_fkey)
# - PKs: {table}_pkey           (e.g., ActionItem_pkey)
# - Unique indexes are handled explicitly in __table_args__
_naming_convention = {
    "fk": "%(table_name)s_%(column_0_name)s_fkey",
    "pk": "%(table_name)s_pkey",
}


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models.

    Models map to existing Prisma-created tables:
    - Table names: PascalCase (__tablename__ = "Document")
    - Column names: camelCase (mapped_column("projectId", ...))
    """

    metadata = sa.MetaData(naming_convention=_naming_convention)
