"""PortfolioSnapshot, IndustryBenchmark models."""

from datetime import datetime
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.helpers import generate_cuid


class PortfolioSnapshot(Base):
    __tablename__ = "PortfolioSnapshot"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    total_projects: Mapped[int] = mapped_column("totalProjects", sa.Integer, nullable=False)
    active_projects: Mapped[int] = mapped_column("activeProjects", sa.Integer, nullable=False)
    total_contract_value: Mapped[Decimal] = mapped_column("totalContractValue", sa.Numeric, nullable=False)
    total_exposure: Mapped[Decimal] = mapped_column("totalExposure", sa.Numeric, nullable=False)
    avg_health_score: Mapped[int] = mapped_column("avgHealthScore", sa.Integer, nullable=False)
    details: Mapped[dict] = mapped_column(JSONB, nullable=False)

    snapshot_date: Mapped[datetime] = mapped_column(
        "snapshotDate", sa.DateTime(timezone=False), server_default=sa.func.now()
    )

    __table_args__ = (
        sa.Index("PortfolioSnapshot_snapshotDate_idx", "snapshotDate"),
    )


class IndustryBenchmark(Base):
    __tablename__ = "IndustryBenchmark"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    category: Mapped[str] = mapped_column(sa.Text, nullable=False)
    metric: Mapped[str] = mapped_column(sa.Text, nullable=False)
    value: Mapped[Decimal] = mapped_column(sa.Numeric, nullable=False)
    source: Mapped[str | None] = mapped_column(sa.Text)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )
