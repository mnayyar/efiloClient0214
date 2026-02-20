"""Notification, AuditLog models."""

from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import NotificationChannel, NotificationSeverity, NotificationType
from app.models.helpers import generate_cuid


class Notification(Base):
    __tablename__ = "Notification"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    user_id: Mapped[str] = mapped_column(
        "userId", sa.Text, sa.ForeignKey("User.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    type: Mapped[NotificationType] = mapped_column(
        sa.Enum(NotificationType, name="NotificationType", create_type=False), nullable=False
    )
    severity: Mapped[NotificationSeverity] = mapped_column(
        sa.Enum(NotificationSeverity, name="NotificationSeverity", create_type=False), nullable=False
    )
    channel: Mapped[NotificationChannel] = mapped_column(
        sa.Enum(NotificationChannel, name="NotificationChannel", create_type=False),
        server_default="IN_APP",
    )
    title: Mapped[str] = mapped_column(sa.Text, nullable=False)
    message: Mapped[str] = mapped_column(sa.Text, nullable=False)
    project_id: Mapped[str | None] = mapped_column("projectId", sa.Text)
    entity_id: Mapped[str | None] = mapped_column("entityId", sa.Text)
    entity_type: Mapped[str | None] = mapped_column("entityType", sa.Text)
    read: Mapped[bool] = mapped_column(sa.Boolean, server_default="false")
    sent_at: Mapped[datetime | None] = mapped_column("sentAt", sa.DateTime(timezone=False))

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="notifications")  # noqa: F821

    __table_args__ = (
        sa.Index("Notification_userId_read_idx", "userId", "read"),
        sa.Index("Notification_projectId_idx", "projectId"),
    )


class AuditLog(Base):
    __tablename__ = "AuditLog"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    user_id: Mapped[str] = mapped_column(
        "userId", sa.Text, sa.ForeignKey("User.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    action: Mapped[str] = mapped_column(sa.Text, nullable=False)
    entity_type: Mapped[str] = mapped_column("entityType", sa.Text, nullable=False)
    entity_id: Mapped[str] = mapped_column("entityId", sa.Text, nullable=False)
    project_id: Mapped[str | None] = mapped_column("projectId", sa.Text)
    details: Mapped[dict | None] = mapped_column(JSONB)
    ai_generated: Mapped[bool] = mapped_column("aiGenerated", sa.Boolean, server_default="false")
    ai_model: Mapped[str | None] = mapped_column("aiModel", sa.Text)
    tokens_used: Mapped[int | None] = mapped_column("tokensUsed", sa.Integer)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="audit_logs")  # noqa: F821

    __table_args__ = (
        sa.Index("AuditLog_userId_createdAt_idx", "userId", "createdAt"),
        sa.Index("AuditLog_entityType_entityId_idx", "entityType", "entityId"),
        sa.Index("AuditLog_projectId_createdAt_idx", "projectId", "createdAt"),
    )
