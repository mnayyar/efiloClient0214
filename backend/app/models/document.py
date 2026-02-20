"""Document, DocumentChunk, DocumentRevision models."""

from datetime import datetime

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import DocumentStatus, DocumentType
from app.models.helpers import generate_cuid


class Document(Base):
    __tablename__ = "Document"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    project_id: Mapped[str] = mapped_column(
        "projectId", sa.Text, sa.ForeignKey("Project.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(sa.Text, nullable=False)
    type: Mapped[DocumentType] = mapped_column(
        sa.Enum(DocumentType, name="DocumentType", create_type=False), nullable=False
    )
    status: Mapped[DocumentStatus] = mapped_column(
        sa.Enum(DocumentStatus, name="DocumentStatus", create_type=False),
        server_default="UPLOADING",
    )
    mime_type: Mapped[str] = mapped_column("mimeType", sa.Text, nullable=False)
    file_size: Mapped[int] = mapped_column("fileSize", sa.Integer, nullable=False)
    r2_key: Mapped[str] = mapped_column("r2Key", sa.Text, nullable=False)
    page_count: Mapped[int | None] = mapped_column("pageCount", sa.Integer)
    uploaded_by_id: Mapped[str] = mapped_column("uploadedById", sa.Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", sa.DateTime(timezone=False), default=sa.func.now(), onupdate=sa.func.now()
    )

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="documents")  # noqa: F821
    chunks: Mapped[list["DocumentChunk"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )
    revisions: Mapped[list["DocumentRevision"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )

    __table_args__ = (
        sa.Index("Document_projectId_type_idx", "projectId", "type"),
        sa.Index("Document_status_idx", "status"),
    )


class DocumentChunk(Base):
    __tablename__ = "DocumentChunk"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    document_id: Mapped[str] = mapped_column(
        "documentId", sa.Text, sa.ForeignKey("Document.id", onupdate="CASCADE", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[str] = mapped_column(sa.Text, nullable=False)
    chunk_index: Mapped[int] = mapped_column("chunkIndex", sa.Integer, nullable=False)
    page_number: Mapped[int | None] = mapped_column("pageNumber", sa.Integer)
    section_ref: Mapped[str | None] = mapped_column("sectionRef", sa.Text)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB)

    # Vector embedding (added via raw SQL migration, not managed by Prisma)
    embedding = mapped_column("embedding", Vector(1536))

    # Full-text search vector (added via raw SQL migration)
    search_vector = mapped_column("search_vector", TSVECTOR)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )

    # Relationships
    document: Mapped["Document"] = relationship(back_populates="chunks")

    __table_args__ = (
        sa.Index("DocumentChunk_documentId_chunkIndex_idx", "documentId", "chunkIndex"),
        sa.Index("DocumentChunk_pageNumber_idx", "pageNumber"),
        sa.Index("idx_document_chunk_search_vector", "search_vector", postgresql_using="gin"),
    )


class DocumentRevision(Base):
    __tablename__ = "DocumentRevision"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    document_id: Mapped[str] = mapped_column(
        "documentId", sa.Text, sa.ForeignKey("Document.id", onupdate="CASCADE", ondelete="CASCADE"), nullable=False
    )
    revision_number: Mapped[int] = mapped_column("revisionNumber", sa.Integer, nullable=False)
    revision_date: Mapped[datetime] = mapped_column(
        "revisionDate", sa.DateTime(timezone=False), nullable=False
    )
    uploaded_by: Mapped[str] = mapped_column("uploadedBy", sa.Text, nullable=False)
    change_log: Mapped[str | None] = mapped_column("changeLog", sa.Text)
    diff_json: Mapped[dict | None] = mapped_column("diffJson", JSONB)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )

    # Relationships
    document: Mapped["Document"] = relationship(back_populates="revisions")

    __table_args__ = (
        sa.Index("DocumentRevision_documentId_revisionNumber_key", "documentId", "revisionNumber", unique=True),
        sa.Index("DocumentRevision_documentId_revisionDate_idx", "documentId", "revisionDate"),
    )
