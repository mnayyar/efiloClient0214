"""Shared schema helpers and standard error handling."""

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError


def handle_integrity_error(exc: IntegrityError) -> HTTPException:
    """Map SQLAlchemy IntegrityError to appropriate HTTP error.

    Matches the Prisma error code mapping:
      P2025 → 404  (record not found)
      P2002 → 409  (unique constraint violation)
    """
    msg = str(exc.orig) if exc.orig else str(exc)
    if "unique" in msg.lower() or "duplicate" in msg.lower():
        return HTTPException(status_code=409, detail="Record already exists")
    if "foreign key" in msg.lower():
        return HTTPException(status_code=400, detail="Related record not found")
    return HTTPException(status_code=500, detail="Database error")
