"""CloseoutChecklist, CloseoutItem, RetentionTracker, RetentionCondition models."""

from datetime import datetime
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import CloseoutCategory, CloseoutItemStatus, RetentionConditionStatus
from app.models.helpers import generate_cuid


class CloseoutChecklist(Base):
    __tablename__ = "CloseoutChecklist"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    project_id: Mapped[str] = mapped_column(
        "projectId", sa.Text, sa.ForeignKey("Project.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    category: Mapped[CloseoutCategory] = mapped_column(
        sa.Enum(CloseoutCategory, name="CloseoutCategory", create_type=False), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", sa.DateTime(timezone=False), default=sa.func.now(), onupdate=sa.func.now()
    )

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="closeout_checklists")  # noqa: F821
    items: Mapped[list["CloseoutItem"]] = relationship(back_populates="checklist")

    __table_args__ = (
        sa.Index("CloseoutChecklist_projectId_category_key", "projectId", "category", unique=True),
    )


class CloseoutItem(Base):
    __tablename__ = "CloseoutItem"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    checklist_id: Mapped[str] = mapped_column(
        "checklistId", sa.Text, sa.ForeignKey("CloseoutChecklist.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    title: Mapped[str] = mapped_column(sa.Text, nullable=False)
    description: Mapped[str | None] = mapped_column(sa.Text)
    status: Mapped[CloseoutItemStatus] = mapped_column(
        sa.Enum(CloseoutItemStatus, name="CloseoutItemStatus", create_type=False),
        server_default="NOT_STARTED",
    )
    assigned_to: Mapped[str | None] = mapped_column("assignedTo", sa.Text)
    due_date: Mapped[datetime | None] = mapped_column("dueDate", sa.DateTime(timezone=False))
    completed_at: Mapped[datetime | None] = mapped_column("completedAt", sa.DateTime(timezone=False))

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", sa.DateTime(timezone=False), default=sa.func.now(), onupdate=sa.func.now()
    )

    # Relationships
    checklist: Mapped["CloseoutChecklist"] = relationship(back_populates="items")


class RetentionTracker(Base):
    __tablename__ = "RetentionTracker"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    project_id: Mapped[str] = mapped_column(
        "projectId", sa.Text, sa.ForeignKey("Project.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    retention_amount: Mapped[Decimal] = mapped_column("retentionAmount", sa.Numeric, nullable=False)
    released_amount: Mapped[Decimal] = mapped_column("releasedAmount", sa.Numeric, server_default="0")

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", sa.DateTime(timezone=False), default=sa.func.now(), onupdate=sa.func.now()
    )

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="retention_trackers")  # noqa: F821
    conditions: Mapped[list["RetentionCondition"]] = relationship(back_populates="tracker")

    __table_args__ = (
        sa.Index("RetentionTracker_projectId_key", "projectId", unique=True),
    )


class RetentionCondition(Base):
    __tablename__ = "RetentionCondition"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    tracker_id: Mapped[str] = mapped_column(
        "trackerId", sa.Text, sa.ForeignKey("RetentionTracker.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    title: Mapped[str] = mapped_column(sa.Text, nullable=False)
    status: Mapped[RetentionConditionStatus] = mapped_column(
        sa.Enum(RetentionConditionStatus, name="RetentionConditionStatus", create_type=False),
        server_default="PENDING",
    )
    due_date: Mapped[datetime | None] = mapped_column("dueDate", sa.DateTime(timezone=False))

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", sa.DateTime(timezone=False), default=sa.func.now(), onupdate=sa.func.now()
    )

    # Relationships
    tracker: Mapped["RetentionTracker"] = relationship(back_populates="conditions")
