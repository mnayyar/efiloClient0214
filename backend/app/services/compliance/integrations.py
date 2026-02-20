"""Compliance integration triggers.

Connects RFIs and change events to the compliance engine.
When an RFI flags a potential change order, or a change event is created,
relevant contract clauses are matched and deadlines are created.
Also provides: compliance health component, compliance data search.
"""

import logging
from datetime import datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.compliance import (
    ComplianceAuditLog,
    ComplianceDeadline,
    ComplianceNotice,
    ContractClause,
)
from app.models.enums import (
    ContractClauseKind,
    DeadlineStatus,
    TriggerEventType,
)

from .deadlines import create_deadline
from .scoring import calculate_score

logger = logging.getLogger(__name__)

# Clause kinds triggered by RFI CO detection
RFI_CO_CLAUSE_KINDS = [
    ContractClauseKind.CLAIMS_PROCEDURE,
    ContractClauseKind.CHANGE_ORDER_PROCESS,
]

# Clause kinds triggered by change events
CHANGE_EVENT_CLAUSE_KINDS = [
    ContractClauseKind.CHANGE_ORDER_PROCESS,
    ContractClauseKind.CLAIMS_PROCEDURE,
    ContractClauseKind.NOTICE_REQUIREMENTS,
]


async def trigger_rfi_compliance(
    db: AsyncSession,
    project_id: str,
    rfi_id: str,
    rfi_number: str,
    rfi_subject: str,
    user_id: str | None = None,
) -> list[ComplianceDeadline]:
    """Trigger compliance deadlines when an RFI flags a potential change order.

    Finds matching CLAIMS_PROCEDURE and CHANGE_ORDER_PROCESS clauses
    and creates deadlines for each.
    """
    now = datetime.utcnow()
    created_deadlines: list[ComplianceDeadline] = []

    # Find matching clauses
    result = await db.execute(
        select(ContractClause).where(
            ContractClause.project_id == project_id,
            ContractClause.kind.in_(RFI_CO_CLAUSE_KINDS),
            ContractClause.deadline_days.isnot(None),
        )
    )
    clauses = result.scalars().all()

    if not clauses:
        logger.info(
            "No matching clauses for RFI %s CO trigger (project %s)",
            rfi_number, project_id,
        )
        return []

    for clause in clauses:
        # Check for existing deadline from same trigger
        existing = await db.execute(
            select(ComplianceDeadline).where(
                ComplianceDeadline.project_id == project_id,
                ComplianceDeadline.clause_id == clause.id,
                ComplianceDeadline.trigger_event_id == rfi_id,
                ComplianceDeadline.trigger_event_type == TriggerEventType.RFI,
                ComplianceDeadline.status.notin_([
                    DeadlineStatus.EXPIRED,
                    DeadlineStatus.WAIVED,
                ]),
            )
        )
        if existing.scalar_one_or_none():
            logger.debug(
                "Deadline already exists for clause %s + RFI %s",
                clause.id, rfi_id,
            )
            continue

        trigger_desc = (
            f"RFI #{rfi_number} \"{rfi_subject}\" flagged as potential change order. "
            f"Per {clause.section_ref or clause.title}, notice is required within "
            f"{clause.deadline_days} {clause.deadline_type.value.lower().replace('_', ' ') if clause.deadline_type else 'days'}."
        )

        deadline = await create_deadline(
            db,
            project_id=project_id,
            clause_id=clause.id,
            trigger_event_type=TriggerEventType.RFI,
            trigger_description=trigger_desc,
            triggered_at=now,
            trigger_event_id=rfi_id,
            triggered_by=user_id,
        )
        if deadline:
            created_deadlines.append(deadline)

    if created_deadlines:
        logger.info(
            "Created %d compliance deadlines from RFI %s CO trigger",
            len(created_deadlines), rfi_number,
        )

    return created_deadlines


async def trigger_change_event_compliance(
    db: AsyncSession,
    project_id: str,
    change_event_id: str,
    change_description: str,
    user_id: str | None = None,
) -> list[ComplianceDeadline]:
    """Trigger compliance deadlines when a change event is created.

    Finds matching CHANGE_ORDER_PROCESS, CLAIMS_PROCEDURE, and
    NOTICE_REQUIREMENTS clauses and creates deadlines for each.
    """
    now = datetime.utcnow()
    created_deadlines: list[ComplianceDeadline] = []

    # Find matching clauses
    result = await db.execute(
        select(ContractClause).where(
            ContractClause.project_id == project_id,
            ContractClause.kind.in_(CHANGE_EVENT_CLAUSE_KINDS),
            ContractClause.deadline_days.isnot(None),
        )
    )
    clauses = result.scalars().all()

    if not clauses:
        logger.info(
            "No matching clauses for change event %s (project %s)",
            change_event_id, project_id,
        )
        return []

    for clause in clauses:
        # Check for existing deadline from same trigger
        existing = await db.execute(
            select(ComplianceDeadline).where(
                ComplianceDeadline.project_id == project_id,
                ComplianceDeadline.clause_id == clause.id,
                ComplianceDeadline.trigger_event_id == change_event_id,
                ComplianceDeadline.trigger_event_type == TriggerEventType.CHANGE_ORDER,
                ComplianceDeadline.status.notin_([
                    DeadlineStatus.EXPIRED,
                    DeadlineStatus.WAIVED,
                ]),
            )
        )
        if existing.scalar_one_or_none():
            continue

        trigger_desc = (
            f"Change event: {change_description}. "
            f"Per {clause.section_ref or clause.title}, notice is required within "
            f"{clause.deadline_days} {clause.deadline_type.value.lower().replace('_', ' ') if clause.deadline_type else 'days'}."
        )

        deadline = await create_deadline(
            db,
            project_id=project_id,
            clause_id=clause.id,
            trigger_event_type=TriggerEventType.CHANGE_ORDER,
            trigger_description=trigger_desc,
            triggered_at=now,
            trigger_event_id=change_event_id,
            triggered_by=user_id,
        )
        if deadline:
            created_deadlines.append(deadline)

    if created_deadlines:
        logger.info(
            "Created %d compliance deadlines from change event %s",
            len(created_deadlines), change_event_id,
        )

    return created_deadlines


async def check_rfi_compliance(
    db: AsyncSession,
    project_id: str,
    rfi_id: str,
) -> dict:
    """Check compliance status for a specific RFI.

    Returns summary of any deadlines triggered by this RFI.
    """
    result = await db.execute(
        select(ComplianceDeadline).where(
            ComplianceDeadline.project_id == project_id,
            ComplianceDeadline.trigger_event_id == rfi_id,
            ComplianceDeadline.trigger_event_type == TriggerEventType.RFI,
        )
    )
    deadlines = result.scalars().all()

    return {
        "rfiId": rfi_id,
        "deadlineCount": len(deadlines),
        "deadlines": [
            {
                "id": d.id,
                "clauseId": d.clause_id,
                "status": d.status.value,
                "severity": d.severity.value,
                "calculatedDeadline": d.calculated_deadline.isoformat(),
                "triggerDescription": d.trigger_description,
            }
            for d in deadlines
        ],
    }


# ── Project Health Component ──────────────────────────────────────────────


async def get_compliance_health_component(
    db: AsyncSession,
    project_id: str,
) -> dict:
    """Get compliance as a component of project health (20% weight).

    Returns a health component dict used by the project health dashboard.
    """
    score = await calculate_score(db, project_id)

    weight = 0.2  # 20% of overall project health

    compliance_pct = score.score if score.score is not None else 100
    component_score = compliance_pct

    # Penalize for at-risk deadlines
    if score.at_risk_count > 0:
        component_score = max(0, component_score - score.at_risk_count * 5)

    component_score = round(component_score)

    status = "good"
    if component_score < 80 or score.at_risk_count > 2:
        status = "warning"
    if component_score < 60 or score.at_risk_count > 5:
        status = "critical"

    return {
        "name": "Contract Compliance",
        "score": component_score,
        "weight": weight,
        "status": status,
        "details": {
            "compliancePercentage": score.score,
            "onTimeCount": score.on_time_count,
            "totalCount": score.total_count,
            "currentStreak": score.current_streak,
            "protectedClaimsValue": float(score.protected_claims_value or 0),
            "atRiskCount": score.at_risk_count,
            "activeDeadlines": score.active_count,
        },
    }


# ── Compliance Search ─────────────────────────────────────────────────────


async def search_compliance_data(
    db: AsyncSession,
    project_id: str,
    query: str,
    types: list[str] | None = None,
    status_filter: str | None = None,
    severity_filter: str | None = None,
) -> list[dict]:
    """Search compliance data (clauses, deadlines, notices) by keyword.

    Returns structured results for the compliance search endpoint.
    """
    results: list[dict] = []
    search_types = types or ["contract_clause", "compliance_deadline", "compliance_notice"]
    search_term = f"%{query}%"

    # Search contract clauses
    if "contract_clause" in search_types:
        clause_query = (
            select(ContractClause)
            .where(
                ContractClause.project_id == project_id,
                or_(
                    ContractClause.title.ilike(search_term),
                    ContractClause.content.ilike(search_term),
                    ContractClause.section_ref.ilike(search_term),
                    ContractClause.trigger.ilike(search_term),
                ),
            )
            .order_by(ContractClause.created_at.desc())
            .limit(20)
        )
        clause_result = await db.execute(clause_query)
        clauses = clause_result.scalars().all()

        for c in clauses:
            kind_display = c.kind.value.replace("_", " ") if c.kind else ""
            dl_type_display = c.deadline_type.value.replace("_", " ").lower() if c.deadline_type else ""
            notice_method_display = c.notice_method.value.replace("_", " ").lower() if c.notice_method else "N/A"

            results.append({
                "id": c.id,
                "type": "contract_clause",
                "title": f"{c.section_ref or ''} {c.title}".strip(),
                "description": f"{kind_display} · {c.deadline_days or 'N/A'} {dl_type_display} · {notice_method_display}",
                "status": "Confirmed" if c.confirmed else "Needs Review" if c.requires_review else "Pending",
                "metadata": {
                    "kind": c.kind.value if c.kind else None,
                    "deadlineDays": c.deadline_days,
                    "deadlineType": c.deadline_type.value if c.deadline_type else None,
                    "noticeMethod": c.notice_method.value if c.notice_method else None,
                    "aiExtracted": c.ai_extracted,
                },
                "createdAt": c.created_at.isoformat() if c.created_at else None,
            })

    # Search compliance deadlines
    if "compliance_deadline" in search_types:
        dl_conditions = [
            ComplianceDeadline.project_id == project_id,
            ComplianceDeadline.trigger_description.ilike(search_term),
        ]
        if status_filter:
            dl_conditions.append(ComplianceDeadline.status == status_filter)
        if severity_filter:
            dl_conditions.append(ComplianceDeadline.severity == severity_filter)

        dl_query = (
            select(ComplianceDeadline)
            .where(*dl_conditions)
            .order_by(ComplianceDeadline.calculated_deadline.asc())
            .limit(20)
        )
        dl_result = await db.execute(dl_query)
        deadlines = dl_result.scalars().all()

        for d in deadlines:
            # Load clause title
            clause_title = ""
            clause_ref = ""
            if d.clause_id:
                cr = await db.execute(
                    select(ContractClause.title, ContractClause.section_ref)
                    .where(ContractClause.id == d.clause_id)
                )
                row = cr.one_or_none()
                if row:
                    clause_title = row[0] or ""
                    clause_ref = row[1] or "N/A"

            results.append({
                "id": d.id,
                "type": "compliance_deadline",
                "title": f"Deadline: {clause_title} ({clause_ref})",
                "description": d.trigger_description,
                "status": d.status.value,
                "severity": d.severity.value,
                "metadata": {
                    "clauseId": d.clause_id,
                    "calculatedDeadline": d.calculated_deadline.isoformat() if d.calculated_deadline else None,
                    "triggerEventType": d.trigger_event_type.value if d.trigger_event_type else None,
                    "triggerEventId": d.trigger_event_id,
                },
                "createdAt": d.created_at.isoformat() if d.created_at else None,
            })

    # Search compliance notices
    if "compliance_notice" in search_types:
        notice_query = (
            select(ComplianceNotice)
            .where(
                ComplianceNotice.project_id == project_id,
                or_(
                    ComplianceNotice.title.ilike(search_term),
                    ComplianceNotice.content.ilike(search_term),
                ),
            )
            .order_by(ComplianceNotice.created_at.desc())
            .limit(20)
        )
        notice_result = await db.execute(notice_query)
        notices = notice_result.scalars().all()

        for n in notices:
            type_display = n.type.value.replace("_", " ") if n.type else ""
            sent_str = f"Sent {n.sent_at.isoformat()[:10]}" if n.sent_at else "Not sent"

            results.append({
                "id": n.id,
                "type": "compliance_notice",
                "title": n.title,
                "description": f"{type_display} · {n.status.value} · {sent_str}",
                "status": n.status.value,
                "metadata": {
                    "noticeType": n.type.value if n.type else None,
                    "sentAt": n.sent_at.isoformat() if n.sent_at else None,
                    "onTimeStatus": n.on_time_status,
                    "generatedByAI": n.generated_by_ai,
                },
                "createdAt": n.created_at.isoformat() if n.created_at else None,
            })

    return results
