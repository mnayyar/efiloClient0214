"""All SQLAlchemy models — import here so Alembic's Base.metadata sees them."""

from app.models.organization import Organization
from app.models.user import User
from app.models.project import Project
from app.models.document import Document, DocumentChunk, DocumentRevision
from app.models.search import ChatSession, SearchAnalytics, SearchQuery
from app.models.rfi import RFI
from app.models.compliance import (
    ComplianceAuditLog,
    ComplianceDeadline,
    ComplianceNotice,
    ComplianceScore,
    ComplianceScoreHistory,
    ContractClause,
    ProjectHoliday,
)
from app.models.change import ChangeEvent
from app.models.health import EarnedValueMetric, HealthScore, WIPReport
from app.models.meeting import ActionItem, Meeting, TalkingPoint
from app.models.closeout import CloseoutChecklist, CloseoutItem, RetentionCondition, RetentionTracker
from app.models.enterprise import IndustryBenchmark, PortfolioSnapshot
from app.models.notification import AuditLog, Notification

__all__ = [
    "Organization",
    "User",
    "Project",
    "Document",
    "DocumentChunk",
    "DocumentRevision",
    "SearchQuery",
    "ChatSession",
    "SearchAnalytics",
    "ContractClause",
    "RFI",
    "ComplianceNotice",
    "ComplianceScore",
    "ComplianceDeadline",
    "ComplianceScoreHistory",
    "ComplianceAuditLog",
    "ProjectHoliday",
    "ChangeEvent",
    "HealthScore",
    "WIPReport",
    "EarnedValueMetric",
    "Meeting",
    "TalkingPoint",
    "ActionItem",
    "CloseoutChecklist",
    "CloseoutItem",
    "RetentionTracker",
    "RetentionCondition",
    "PortfolioSnapshot",
    "IndustryBenchmark",
    "Notification",
    "AuditLog",
]
