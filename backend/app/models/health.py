"""HealthScore, WIPReport, EarnedValueMetric models."""

from datetime import datetime
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import HealthScorePosture
from app.models.helpers import generate_cuid


class HealthScore(Base):
    __tablename__ = "HealthScore"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    project_id: Mapped[str] = mapped_column(
        "projectId", sa.Text, sa.ForeignKey("Project.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    overall_score: Mapped[int] = mapped_column("overallScore", sa.Integer, nullable=False)
    posture: Mapped[HealthScorePosture] = mapped_column(
        sa.Enum(HealthScorePosture, name="HealthScorePosture", create_type=False), nullable=False
    )
    cost_score: Mapped[int] = mapped_column("costScore", sa.Integer, nullable=False)
    schedule_score: Mapped[int] = mapped_column("scheduleScore", sa.Integer, nullable=False)
    compliance_score: Mapped[int] = mapped_column("complianceScore", sa.Integer, nullable=False)
    change_exposure_score: Mapped[int] = mapped_column("changeExposureScore", sa.Integer, nullable=False)
    coordination_score: Mapped[int] = mapped_column("coordinationScore", sa.Integer, nullable=False)
    narrative: Mapped[str | None] = mapped_column(sa.Text)
    ai_model: Mapped[str | None] = mapped_column("aiModel", sa.Text)

    calculated_at: Mapped[datetime] = mapped_column(
        "calculatedAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="health_scores")  # noqa: F821

    __table_args__ = (
        sa.Index("HealthScore_projectId_calculatedAt_idx", "projectId", "calculatedAt"),
    )


class WIPReport(Base):
    __tablename__ = "WIPReport"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    project_id: Mapped[str] = mapped_column(
        "projectId", sa.Text, sa.ForeignKey("Project.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    report_date: Mapped[datetime] = mapped_column("reportDate", sa.DateTime(timezone=False), nullable=False)
    contract_value: Mapped[Decimal] = mapped_column("contractValue", sa.Numeric, nullable=False)
    billed_to_date: Mapped[Decimal] = mapped_column("billedToDate", sa.Numeric, nullable=False)
    cost_to_date: Mapped[Decimal] = mapped_column("costToDate", sa.Numeric, nullable=False)
    percent_complete: Mapped[Decimal] = mapped_column("percentComplete", sa.Numeric, nullable=False)
    projected_cost: Mapped[Decimal | None] = mapped_column("projectedCost", sa.Numeric)
    raw_data: Mapped[dict | None] = mapped_column("rawData", JSONB)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="wip_reports")  # noqa: F821

    __table_args__ = (
        sa.Index("WIPReport_projectId_reportDate_idx", "projectId", "reportDate"),
    )


class EarnedValueMetric(Base):
    __tablename__ = "EarnedValueMetric"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    project_id: Mapped[str] = mapped_column(
        "projectId", sa.Text, sa.ForeignKey("Project.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    report_date: Mapped[datetime] = mapped_column("reportDate", sa.DateTime(timezone=False), nullable=False)
    planned_value: Mapped[Decimal] = mapped_column("plannedValue", sa.Numeric, nullable=False)
    earned_value: Mapped[Decimal] = mapped_column("earnedValue", sa.Numeric, nullable=False)
    actual_cost: Mapped[Decimal] = mapped_column("actualCost", sa.Numeric, nullable=False)
    cpi: Mapped[Decimal | None] = mapped_column(sa.Numeric)
    spi: Mapped[Decimal | None] = mapped_column(sa.Numeric)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="earned_value_metrics")  # noqa: F821

    __table_args__ = (
        sa.Index("EarnedValueMetric_projectId_reportDate_idx", "projectId", "reportDate"),
    )
