"""ChangeEvent model."""

from datetime import datetime
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import ChangeEventStatus, ChangeEventType
from app.models.helpers import generate_cuid


class ChangeEvent(Base):
    __tablename__ = "ChangeEvent"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    project_id: Mapped[str] = mapped_column(
        "projectId", sa.Text, sa.ForeignKey("Project.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    type: Mapped[ChangeEventType] = mapped_column(
        sa.Enum(ChangeEventType, name="ChangeEventType", create_type=False), nullable=False
    )
    status: Mapped[ChangeEventStatus] = mapped_column(
        sa.Enum(ChangeEventStatus, name="ChangeEventStatus", create_type=False),
        server_default="IDENTIFIED",
    )
    title: Mapped[str] = mapped_column(sa.Text, nullable=False)
    description: Mapped[str] = mapped_column(sa.Text, nullable=False)
    estimated_value: Mapped[Decimal | None] = mapped_column("estimatedValue", sa.Numeric)
    approved_value: Mapped[Decimal | None] = mapped_column("approvedValue", sa.Numeric)
    schedule_days: Mapped[int | None] = mapped_column("scheduleDays", sa.Integer)
    source_rfi_id: Mapped[str | None] = mapped_column("sourceRfiId", sa.Text)
    source_doc_ids: Mapped[list[str] | None] = mapped_column(
        "sourceDocIds", ARRAY(sa.Text), server_default="{}"
    )

    created_by_id: Mapped[str] = mapped_column("createdById", sa.Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", sa.DateTime(timezone=False), default=sa.func.now(), onupdate=sa.func.now()
    )

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="change_events")  # noqa: F821

    __table_args__ = (
        sa.Index("ChangeEvent_projectId_status_idx", "projectId", "status"),
        sa.Index("ChangeEvent_type_idx", "type"),
    )
