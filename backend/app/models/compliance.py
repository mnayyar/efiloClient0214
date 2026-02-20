"""Compliance models: ContractClause, ComplianceNotice, ComplianceScore,
ComplianceDeadline, ComplianceScoreHistory, ComplianceAuditLog, ProjectHoliday."""

from datetime import datetime
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import (
    ComplianceNoticeStatus,
    ComplianceNoticeType,
    ContractClauseKind,
    ContractClauseMethod,
    DeadlineStatus,
    DeadlineType,
    Severity,
    TriggerEventType,
)
from app.models.helpers import generate_cuid


class ContractClause(Base):
    __tablename__ = "ContractClause"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    project_id: Mapped[str] = mapped_column(
        "projectId", sa.Text, sa.ForeignKey("Project.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    kind: Mapped[ContractClauseKind] = mapped_column(
        sa.Enum(ContractClauseKind, name="ContractClauseKind", create_type=False), nullable=False
    )
    title: Mapped[str] = mapped_column(sa.Text, nullable=False)
    content: Mapped[str] = mapped_column(sa.Text, nullable=False)
    section_ref: Mapped[str | None] = mapped_column("sectionRef", sa.Text)
    deadline_days: Mapped[int | None] = mapped_column("deadlineDays", sa.Integer)
    deadline_type: Mapped[DeadlineType | None] = mapped_column(
        "deadlineType", sa.Enum(DeadlineType, name="DeadlineType", create_type=False)
    )
    notice_method: Mapped[ContractClauseMethod | None] = mapped_column(
        "noticeMethod", sa.Enum(ContractClauseMethod, name="ContractClauseMethod", create_type=False)
    )
    ai_extracted: Mapped[bool] = mapped_column("aiExtracted", sa.Boolean, server_default="true")
    ai_model: Mapped[str | None] = mapped_column("aiModel", sa.Text)
    source_doc_id: Mapped[str | None] = mapped_column("sourceDocId", sa.Text)

    # Trigger definition
    trigger: Mapped[str | None] = mapped_column(sa.Text)

    # Cure period
    cure_period_days: Mapped[int | None] = mapped_column("curePeriodDays", sa.Integer)
    cure_period_type: Mapped[DeadlineType | None] = mapped_column(
        "curePeriodType", sa.Enum(DeadlineType, name="DeadlineType", create_type=False)
    )

    # Flow-down
    flow_down_provisions: Mapped[str | None] = mapped_column("flowDownProvisions", sa.Text)
    parent_clause_ref: Mapped[str | None] = mapped_column("parentClauseRef", sa.Text)

    # Review status
    requires_review: Mapped[bool] = mapped_column("requiresReview", sa.Boolean, server_default="false")
    review_reason: Mapped[str | None] = mapped_column("reviewReason", sa.Text)
    confirmed: Mapped[bool] = mapped_column(sa.Boolean, server_default="false")
    confirmed_at: Mapped[datetime | None] = mapped_column("confirmedAt", sa.DateTime(timezone=False))
    confirmed_by: Mapped[str | None] = mapped_column("confirmedBy", sa.Text)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", sa.DateTime(timezone=False), default=sa.func.now(), onupdate=sa.func.now()
    )

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="contract_clauses")  # noqa: F821
    compliance_deadlines: Mapped[list["ComplianceDeadline"]] = relationship(back_populates="clause")

    __table_args__ = (
        sa.Index("ContractClause_projectId_kind_idx", "projectId", "kind"),
    )


class ComplianceNotice(Base):
    __tablename__ = "ComplianceNotice"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    project_id: Mapped[str] = mapped_column(
        "projectId", sa.Text, sa.ForeignKey("Project.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    type: Mapped[ComplianceNoticeType] = mapped_column(
        sa.Enum(ComplianceNoticeType, name="ComplianceNoticeType", create_type=False), nullable=False
    )
    status: Mapped[ComplianceNoticeStatus] = mapped_column(
        sa.Enum(ComplianceNoticeStatus, name="ComplianceNoticeStatus", create_type=False),
        server_default="DRAFT",
    )
    title: Mapped[str] = mapped_column(sa.Text, nullable=False)
    content: Mapped[str] = mapped_column(sa.Text, nullable=False)
    recipient_name: Mapped[str | None] = mapped_column("recipientName", sa.Text)
    recipient_email: Mapped[str | None] = mapped_column("recipientEmail", sa.Text)
    due_date: Mapped[datetime | None] = mapped_column("dueDate", sa.DateTime(timezone=False))
    sent_at: Mapped[datetime | None] = mapped_column("sentAt", sa.DateTime(timezone=False))
    acknowledged_at: Mapped[datetime | None] = mapped_column("acknowledgedAt", sa.DateTime(timezone=False))
    clause_id: Mapped[str | None] = mapped_column("clauseId", sa.Text)

    # Delivery tracking
    delivery_methods: Mapped[list[str] | None] = mapped_column(
        "deliveryMethods", ARRAY(sa.Text), server_default="{}"
    )
    delivery_confirmation: Mapped[dict | None] = mapped_column("deliveryConfirmation", JSONB)
    delivered_at: Mapped[datetime | None] = mapped_column("deliveredAt", sa.DateTime(timezone=False))
    on_time_status: Mapped[bool | None] = mapped_column("onTimeStatus", sa.Boolean)

    # AI tracking
    generated_by_ai: Mapped[bool] = mapped_column("generatedByAI", sa.Boolean, server_default="false")
    ai_model: Mapped[str | None] = mapped_column("aiModel", sa.Text)
    ai_prompt_version: Mapped[str | None] = mapped_column("aiPromptVersion", sa.Text)

    # Approval workflow
    reviewed_by: Mapped[str | None] = mapped_column("reviewedBy", sa.Text)
    reviewed_at: Mapped[datetime | None] = mapped_column("reviewedAt", sa.DateTime(timezone=False))
    approved_by: Mapped[str | None] = mapped_column("approvedBy", sa.Text)
    approved_at: Mapped[datetime | None] = mapped_column("approvedAt", sa.DateTime(timezone=False))

    created_by_id: Mapped[str] = mapped_column("createdById", sa.Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", sa.DateTime(timezone=False), default=sa.func.now(), onupdate=sa.func.now()
    )

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="compliance_notices")  # noqa: F821

    __table_args__ = (
        sa.Index("ComplianceNotice_projectId_type_idx", "projectId", "type"),
        sa.Index("ComplianceNotice_dueDate_idx", "dueDate"),
    )


class ComplianceScore(Base):
    __tablename__ = "ComplianceScore"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    project_id: Mapped[str] = mapped_column(
        "projectId", sa.Text, sa.ForeignKey("Project.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )
    score: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    details: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Streak tracking
    current_streak: Mapped[int] = mapped_column("currentStreak", sa.Integer, server_default="0")
    best_streak: Mapped[int] = mapped_column("bestStreak", sa.Integer, server_default="0")
    streak_broken_at: Mapped[datetime | None] = mapped_column("streakBrokenAt", sa.DateTime(timezone=False))

    # Claims value
    protected_claims_value: Mapped[Decimal] = mapped_column(
        "protectedClaimsValue", sa.Numeric(15, 2), server_default="0"
    )
    at_risk_value: Mapped[Decimal] = mapped_column(
        "atRiskValue", sa.Numeric(15, 2), server_default="0"
    )

    # Counts
    on_time_count: Mapped[int] = mapped_column("onTimeCount", sa.Integer, server_default="0")
    total_count: Mapped[int] = mapped_column("totalCount", sa.Integer, server_default="0")
    missed_count: Mapped[int] = mapped_column("missedCount", sa.Integer, server_default="0")
    at_risk_count: Mapped[int] = mapped_column("atRiskCount", sa.Integer, server_default="0")
    active_count: Mapped[int] = mapped_column("activeCount", sa.Integer, server_default="0")
    upcoming_count: Mapped[int] = mapped_column("upcomingCount", sa.Integer, server_default="0")

    last_calculated_at: Mapped[datetime] = mapped_column(
        "lastCalculatedAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )
    calculated_at: Mapped[datetime] = mapped_column(
        "calculatedAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="compliance_scores")  # noqa: F821

    __table_args__ = (
        sa.Index("ComplianceScore_projectId_calculatedAt_idx", "projectId", "calculatedAt"),
    )


class ComplianceDeadline(Base):
    __tablename__ = "ComplianceDeadline"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    project_id: Mapped[str] = mapped_column(
        "projectId", sa.Text, sa.ForeignKey("Project.id", onupdate="CASCADE", ondelete="CASCADE"), nullable=False
    )
    clause_id: Mapped[str] = mapped_column(
        "clauseId", sa.Text, sa.ForeignKey("ContractClause.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )

    # Trigger event details
    trigger_event_type: Mapped[TriggerEventType] = mapped_column(
        "triggerEventType",
        sa.Enum(TriggerEventType, name="TriggerEventType", create_type=False),
        nullable=False,
    )
    trigger_event_id: Mapped[str | None] = mapped_column("triggerEventId", sa.Text)
    trigger_description: Mapped[str] = mapped_column("triggerDescription", sa.Text, nullable=False)
    triggered_at: Mapped[datetime] = mapped_column("triggeredAt", sa.DateTime(timezone=False), nullable=False)
    triggered_by: Mapped[str | None] = mapped_column("triggeredBy", sa.Text)

    # Calculated deadline
    calculated_deadline: Mapped[datetime] = mapped_column(
        "calculatedDeadline", sa.DateTime(timezone=False), nullable=False
    )
    deadline_timezone: Mapped[str] = mapped_column(
        "deadlineTimezone", sa.Text, server_default="'America/Los_Angeles'"
    )

    # Status tracking
    status: Mapped[DeadlineStatus] = mapped_column(
        sa.Enum(DeadlineStatus, name="DeadlineStatus", create_type=False), server_default="ACTIVE"
    )
    severity: Mapped[Severity] = mapped_column(
        sa.Enum(Severity, name="Severity", create_type=False), server_default="LOW"
    )

    # Notice reference
    notice_id: Mapped[str | None] = mapped_column("noticeId", sa.Text)
    notice_created_at: Mapped[datetime | None] = mapped_column("noticeCreatedAt", sa.DateTime(timezone=False))

    # Waiver
    waived_at: Mapped[datetime | None] = mapped_column("waivedAt", sa.DateTime(timezone=False))
    waived_by: Mapped[str | None] = mapped_column("waivedBy", sa.Text)
    waiver_reason: Mapped[str | None] = mapped_column("waiverReason", sa.Text)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", sa.DateTime(timezone=False), default=sa.func.now(), onupdate=sa.func.now()
    )

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="compliance_deadlines")  # noqa: F821
    clause: Mapped["ContractClause"] = relationship(back_populates="compliance_deadlines")

    __table_args__ = (
        sa.Index("ComplianceDeadline_projectId_idx", "projectId"),
        sa.Index("ComplianceDeadline_status_idx", "status"),
        sa.Index("ComplianceDeadline_severity_idx", "severity"),
        sa.Index("ComplianceDeadline_calculatedDeadline_idx", "calculatedDeadline"),
    )


class ComplianceScoreHistory(Base):
    __tablename__ = "ComplianceScoreHistory"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    project_id: Mapped[str] = mapped_column(
        "projectId", sa.Text, sa.ForeignKey("Project.id", onupdate="CASCADE", ondelete="CASCADE"), nullable=False
    )
    snapshot_date: Mapped[datetime] = mapped_column("snapshotDate", sa.DateTime(timezone=False), nullable=False)
    compliance_percentage: Mapped[Decimal | None] = mapped_column(
        "compliancePercentage", sa.Numeric(5, 2)
    )
    on_time_count: Mapped[int] = mapped_column("onTimeCount", sa.Integer, nullable=False)
    total_count: Mapped[int] = mapped_column("totalCount", sa.Integer, nullable=False)
    notices_sent_in_period: Mapped[int] = mapped_column(
        "noticesSentInPeriod", sa.Integer, server_default="0"
    )
    protected_claims_value: Mapped[Decimal] = mapped_column(
        "protectedClaimsValue", sa.Numeric(15, 2), nullable=False
    )
    period_type: Mapped[str] = mapped_column("periodType", sa.Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="compliance_score_history")  # noqa: F821

    __table_args__ = (
        sa.Index("ComplianceScoreHistory_projectId_idx", "projectId"),
        sa.Index("ComplianceScoreHistory_snapshotDate_idx", "snapshotDate"),
        sa.Index(
            "ComplianceScoreHistory_projectId_snapshotDate_periodType_key",
            "projectId", "snapshotDate", "periodType",
            unique=True,
        ),
    )


class ComplianceAuditLog(Base):
    __tablename__ = "ComplianceAuditLog"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    project_id: Mapped[str] = mapped_column(
        "projectId", sa.Text, sa.ForeignKey("Project.id", onupdate="CASCADE", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[str] = mapped_column("eventType", sa.Text, nullable=False)
    entity_type: Mapped[str] = mapped_column("entityType", sa.Text, nullable=False)
    entity_id: Mapped[str] = mapped_column("entityId", sa.Text, nullable=False)

    user_id: Mapped[str | None] = mapped_column("userId", sa.Text)
    user_email: Mapped[str | None] = mapped_column("userEmail", sa.Text)
    actor_type: Mapped[str] = mapped_column("actorType", sa.Text, server_default="'USER'")

    action: Mapped[str] = mapped_column(sa.Text, nullable=False)
    details: Mapped[dict | None] = mapped_column(JSONB)

    ip_address: Mapped[str | None] = mapped_column("ipAddress", sa.Text)
    user_agent: Mapped[str | None] = mapped_column("userAgent", sa.Text)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="compliance_audit_logs")  # noqa: F821

    __table_args__ = (
        sa.Index("ComplianceAuditLog_projectId_idx", "projectId"),
        sa.Index("ComplianceAuditLog_entityType_entityId_idx", "entityType", "entityId"),
        sa.Index("ComplianceAuditLog_eventType_idx", "eventType"),
        sa.Index("ComplianceAuditLog_createdAt_idx", "createdAt"),
    )


class ProjectHoliday(Base):
    __tablename__ = "ProjectHoliday"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    project_id: Mapped[str] = mapped_column(
        "projectId", sa.Text, sa.ForeignKey("Project.id", onupdate="CASCADE", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[datetime] = mapped_column(sa.Date, nullable=False)
    name: Mapped[str] = mapped_column(sa.Text, nullable=False)
    description: Mapped[str | None] = mapped_column(sa.Text)
    recurring: Mapped[bool] = mapped_column(sa.Boolean, server_default="false")
    source: Mapped[str] = mapped_column(sa.Text, server_default="'MANUAL'")

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", sa.DateTime(timezone=False), default=sa.func.now(), onupdate=sa.func.now()
    )

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="project_holidays")  # noqa: F821

    __table_args__ = (
        sa.Index("ProjectHoliday_projectId_idx", "projectId"),
        sa.Index("ProjectHoliday_date_idx", "date"),
        sa.Index("ProjectHoliday_projectId_date_key", "projectId", "date", unique=True),
    )
