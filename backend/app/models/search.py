"""SearchQuery, ChatSession, SearchAnalytics models."""

from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import SearchScope
from app.models.helpers import generate_cuid


class SearchQuery(Base):
    __tablename__ = "SearchQuery"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    user_id: Mapped[str] = mapped_column(
        "userId", sa.Text, sa.ForeignKey("User.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    project_id: Mapped[str | None] = mapped_column(
        "projectId", sa.Text, sa.ForeignKey("Project.id", onupdate="CASCADE", ondelete="SET NULL")
    )
    query: Mapped[str] = mapped_column(sa.Text, nullable=False)
    scope: Mapped[SearchScope] = mapped_column(
        sa.Enum(SearchScope, name="SearchScope", create_type=False),
        server_default="PROJECT",
    )
    document_types: Mapped[list[str] | None] = mapped_column(
        "documentTypes", ARRAY(sa.Text), server_default="{}"
    )
    response: Mapped[str | None] = mapped_column(sa.Text)
    sources: Mapped[dict | None] = mapped_column(JSONB)
    response_time: Mapped[int | None] = mapped_column("responseTime", sa.Integer)
    token_count: Mapped[int | None] = mapped_column("tokenCount", sa.Integer)
    embedding_time: Mapped[int | None] = mapped_column("embeddingTime", sa.Integer)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="search_queries")  # noqa: F821
    project: Mapped["Project | None"] = relationship(back_populates="search_queries")  # noqa: F821

    __table_args__ = (
        sa.Index("SearchQuery_userId_createdAt_idx", "userId", "createdAt"),
        sa.Index("SearchQuery_projectId_createdAt_idx", "projectId", "createdAt"),
    )


class ChatSession(Base):
    __tablename__ = "ChatSession"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    user_id: Mapped[str] = mapped_column(
        "userId", sa.Text, sa.ForeignKey("User.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    project_id: Mapped[str | None] = mapped_column(
        "projectId", sa.Text, sa.ForeignKey("Project.id", onupdate="CASCADE", ondelete="SET NULL")
    )
    title: Mapped[str | None] = mapped_column(sa.Text)
    messages: Mapped[dict] = mapped_column(JSONB, nullable=False)
    is_archived: Mapped[bool] = mapped_column("isArchived", sa.Boolean, server_default="false")

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", sa.DateTime(timezone=False), default=sa.func.now(), onupdate=sa.func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="chat_sessions")  # noqa: F821
    project: Mapped["Project | None"] = relationship(back_populates="chat_sessions")  # noqa: F821

    __table_args__ = (
        sa.Index("ChatSession_userId_updatedAt_idx", "userId", "updatedAt"),
        sa.Index("ChatSession_projectId_updatedAt_idx", "projectId", "updatedAt"),
    )


class SearchAnalytics(Base):
    __tablename__ = "SearchAnalytics"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    query_id: Mapped[str | None] = mapped_column("queryId", sa.Text)
    user_id: Mapped[str] = mapped_column("userId", sa.Text, nullable=False)
    search_term: Mapped[str] = mapped_column("searchTerm", sa.Text, nullable=False)
    scope: Mapped[SearchScope] = mapped_column(
        sa.Enum(SearchScope, name="SearchScope", create_type=False), nullable=False
    )
    result_count: Mapped[int] = mapped_column("resultCount", sa.Integer, nullable=False)
    clicked_result: Mapped[str | None] = mapped_column("clickedResult", sa.Text)
    user_feedback: Mapped[str | None] = mapped_column("userFeedback", sa.Text)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )

    __table_args__ = (
        sa.Index("SearchAnalytics_userId_createdAt_idx", "userId", "createdAt"),
    )
