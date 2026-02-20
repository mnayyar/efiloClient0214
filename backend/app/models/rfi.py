"""RFI model."""

from datetime import datetime
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import RFIPriority, RFIStatus
from app.models.helpers import generate_cuid


class RFI(Base):
    __tablename__ = "RFI"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    project_id: Mapped[str] = mapped_column(
        "projectId", sa.Text, sa.ForeignKey("Project.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    rfi_number: Mapped[str] = mapped_column("rfiNumber", sa.Text, nullable=False)
    subject: Mapped[str] = mapped_column(sa.Text, nullable=False)
    question: Mapped[str] = mapped_column(sa.Text, nullable=False)
    status: Mapped[RFIStatus] = mapped_column(
        sa.Enum(RFIStatus, name="RFIStatus", create_type=False), server_default="DRAFT"
    )
    priority: Mapped[RFIPriority] = mapped_column(
        sa.Enum(RFIPriority, name="RFIPriority", create_type=False), server_default="MEDIUM"
    )
    assigned_to: Mapped[str | None] = mapped_column("assignedTo", sa.Text)
    due_date: Mapped[datetime | None] = mapped_column("dueDate", sa.DateTime(timezone=False))
    submitted_at: Mapped[datetime | None] = mapped_column("submittedAt", sa.DateTime(timezone=False))
    responded_at: Mapped[datetime | None] = mapped_column("respondedAt", sa.DateTime(timezone=False))
    response: Mapped[str | None] = mapped_column(sa.Text)

    ai_draft_question: Mapped[str | None] = mapped_column("aiDraftQuestion", sa.Text)
    ai_draft_model: Mapped[str | None] = mapped_column("aiDraftModel", sa.Text)
    ai_response_analysis: Mapped[str | None] = mapped_column("aiResponseAnalysis", sa.Text)
    co_flag: Mapped[bool] = mapped_column("coFlag", sa.Boolean, server_default="false")
    co_estimate: Mapped[Decimal | None] = mapped_column("coEstimate", sa.Numeric)
    is_overdue: Mapped[bool] = mapped_column("isOverdue", sa.Boolean, server_default="false")

    source_doc_ids: Mapped[list[str] | None] = mapped_column(
        "sourceDocIds", ARRAY(sa.Text), server_default="{}"
    )
    source_chunk_ids: Mapped[list[str] | None] = mapped_column(
        "sourceChunkIds", ARRAY(sa.Text), server_default="{}"
    )

    created_by_id: Mapped[str] = mapped_column("createdById", sa.Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", sa.DateTime(timezone=False), default=sa.func.now(), onupdate=sa.func.now()
    )

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="rfis")  # noqa: F821

    __table_args__ = (
        sa.Index("RFI_projectId_rfiNumber_key", "projectId", "rfiNumber", unique=True),
        sa.Index("RFI_projectId_status_idx", "projectId", "status"),
        sa.Index("RFI_isOverdue_idx", "isOverdue"),
    )
