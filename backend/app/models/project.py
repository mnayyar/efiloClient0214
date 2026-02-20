"""Project model."""

from datetime import datetime
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import ContractType, ProjectType
from app.models.helpers import generate_cuid


class Project(Base):
    __tablename__ = "Project"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    project_code: Mapped[str] = mapped_column("projectCode", sa.Text, nullable=False)
    name: Mapped[str] = mapped_column(sa.Text, nullable=False)
    type: Mapped[ProjectType] = mapped_column(
        sa.Enum(ProjectType, name="ProjectType", create_type=False), nullable=False
    )
    contract_type: Mapped[ContractType | None] = mapped_column(
        "contractType", sa.Enum(ContractType, name="ContractType", create_type=False)
    )
    contract_value: Mapped[Decimal | None] = mapped_column("contractValue", sa.Numeric)
    status: Mapped[str] = mapped_column(sa.Text, server_default="'active'")
    organization_id: Mapped[str] = mapped_column(
        "organizationId", sa.Text, sa.ForeignKey("Organization.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )

    # Project contacts
    gc_company_name: Mapped[str | None] = mapped_column("gcCompanyName", sa.Text)
    gc_contact_name: Mapped[str | None] = mapped_column("gcContactName", sa.Text)
    gc_contact_email: Mapped[str | None] = mapped_column("gcContactEmail", sa.Text)
    gc_contact_phone: Mapped[str | None] = mapped_column("gcContactPhone", sa.Text)

    architect_name: Mapped[str | None] = mapped_column("architectName", sa.Text)
    architect_email: Mapped[str | None] = mapped_column("architectEmail", sa.Text)
    architect_phone: Mapped[str | None] = mapped_column("architectPhone", sa.Text)

    engineer_name: Mapped[str | None] = mapped_column("engineerName", sa.Text)
    engineer_email: Mapped[str | None] = mapped_column("engineerEmail", sa.Text)
    engineer_phone: Mapped[str | None] = mapped_column("engineerPhone", sa.Text)

    owner_name: Mapped[str | None] = mapped_column("ownerName", sa.Text)
    owner_email: Mapped[str | None] = mapped_column("ownerEmail", sa.Text)
    owner_phone: Mapped[str | None] = mapped_column("ownerPhone", sa.Text)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", sa.DateTime(timezone=False), default=sa.func.now(), onupdate=sa.func.now()
    )

    # Relationships
    organization: Mapped["Organization"] = relationship(back_populates="projects")  # noqa: F821
    documents: Mapped[list["Document"]] = relationship(back_populates="project")  # noqa: F821
    rfis: Mapped[list["RFI"]] = relationship(back_populates="project")  # noqa: F821
    contract_clauses: Mapped[list["ContractClause"]] = relationship(back_populates="project")  # noqa: F821
    compliance_notices: Mapped[list["ComplianceNotice"]] = relationship(back_populates="project")  # noqa: F821
    compliance_scores: Mapped[list["ComplianceScore"]] = relationship(back_populates="project")  # noqa: F821
    health_scores: Mapped[list["HealthScore"]] = relationship(back_populates="project")  # noqa: F821
    wip_reports: Mapped[list["WIPReport"]] = relationship(back_populates="project")  # noqa: F821
    earned_value_metrics: Mapped[list["EarnedValueMetric"]] = relationship(back_populates="project")  # noqa: F821
    change_events: Mapped[list["ChangeEvent"]] = relationship(back_populates="project")  # noqa: F821
    meetings: Mapped[list["Meeting"]] = relationship(back_populates="project")  # noqa: F821
    action_items: Mapped[list["ActionItem"]] = relationship(back_populates="project")  # noqa: F821
    closeout_checklists: Mapped[list["CloseoutChecklist"]] = relationship(back_populates="project")  # noqa: F821
    retention_trackers: Mapped[list["RetentionTracker"]] = relationship(back_populates="project")  # noqa: F821
    search_queries: Mapped[list["SearchQuery"]] = relationship(back_populates="project")  # noqa: F821
    chat_sessions: Mapped[list["ChatSession"]] = relationship(back_populates="project")  # noqa: F821
    compliance_deadlines: Mapped[list["ComplianceDeadline"]] = relationship(back_populates="project")  # noqa: F821
    compliance_score_history: Mapped[list["ComplianceScoreHistory"]] = relationship(back_populates="project")  # noqa: F821
    compliance_audit_logs: Mapped[list["ComplianceAuditLog"]] = relationship(back_populates="project")  # noqa: F821
    project_holidays: Mapped[list["ProjectHoliday"]] = relationship(back_populates="project")  # noqa: F821

    __table_args__ = (
        sa.Index("Project_projectCode_key", "projectCode", unique=True),
    )
