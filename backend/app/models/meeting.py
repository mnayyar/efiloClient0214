"""Meeting, TalkingPoint, ActionItem models."""

from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import ActionItemStatus, MeetingStatus, MeetingType, TalkingPointPriority
from app.models.helpers import generate_cuid


class Meeting(Base):
    __tablename__ = "Meeting"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    project_id: Mapped[str] = mapped_column(
        "projectId", sa.Text, sa.ForeignKey("Project.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    type: Mapped[MeetingType] = mapped_column(
        sa.Enum(MeetingType, name="MeetingType", create_type=False), nullable=False
    )
    status: Mapped[MeetingStatus] = mapped_column(
        sa.Enum(MeetingStatus, name="MeetingStatus", create_type=False), server_default="SCHEDULED"
    )
    title: Mapped[str] = mapped_column(sa.Text, nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column("scheduledAt", sa.DateTime(timezone=False), nullable=False)
    attendees: Mapped[list[str] | None] = mapped_column(ARRAY(sa.Text), server_default="{}")
    agenda: Mapped[str | None] = mapped_column(sa.Text)
    minutes: Mapped[str | None] = mapped_column(sa.Text)
    ai_prep_notes: Mapped[str | None] = mapped_column("aiPrepNotes", sa.Text)

    created_by_id: Mapped[str] = mapped_column("createdById", sa.Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", sa.DateTime(timezone=False), default=sa.func.now(), onupdate=sa.func.now()
    )

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="meetings")  # noqa: F821
    talking_points: Mapped[list["TalkingPoint"]] = relationship(back_populates="meeting")

    __table_args__ = (
        sa.Index("Meeting_projectId_scheduledAt_idx", "projectId", "scheduledAt"),
    )


class TalkingPoint(Base):
    __tablename__ = "TalkingPoint"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    meeting_id: Mapped[str] = mapped_column(
        "meetingId", sa.Text, sa.ForeignKey("Meeting.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    priority: Mapped[TalkingPointPriority] = mapped_column(
        sa.Enum(TalkingPointPriority, name="TalkingPointPriority", create_type=False), nullable=False
    )
    topic: Mapped[str] = mapped_column(sa.Text, nullable=False)
    context: Mapped[str | None] = mapped_column(sa.Text)
    source_doc_ids: Mapped[list[str] | None] = mapped_column(
        "sourceDocIds", ARRAY(sa.Text), server_default="{}"
    )
    ai_generated: Mapped[bool] = mapped_column("aiGenerated", sa.Boolean, server_default="false")

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )

    # Relationships
    meeting: Mapped["Meeting"] = relationship(back_populates="talking_points")


class ActionItem(Base):
    __tablename__ = "ActionItem"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    project_id: Mapped[str] = mapped_column(
        "projectId", sa.Text, sa.ForeignKey("Project.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    title: Mapped[str] = mapped_column(sa.Text, nullable=False)
    description: Mapped[str | None] = mapped_column(sa.Text)
    status: Mapped[ActionItemStatus] = mapped_column(
        sa.Enum(ActionItemStatus, name="ActionItemStatus", create_type=False), server_default="OPEN"
    )
    assigned_to: Mapped[str | None] = mapped_column("assignedTo", sa.Text)
    due_date: Mapped[datetime | None] = mapped_column("dueDate", sa.DateTime(timezone=False))
    completed_at: Mapped[datetime | None] = mapped_column("completedAt", sa.DateTime(timezone=False))
    meeting_id: Mapped[str | None] = mapped_column("meetingId", sa.Text)

    created_by_id: Mapped[str] = mapped_column("createdById", sa.Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", sa.DateTime(timezone=False), default=sa.func.now(), onupdate=sa.func.now()
    )

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="action_items")  # noqa: F821

    __table_args__ = (
        sa.Index("ActionItem_projectId_status_idx", "projectId", "status"),
        sa.Index("ActionItem_dueDate_idx", "dueDate"),
    )
