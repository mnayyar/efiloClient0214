"""Deadline management service.

Handles creation, severity updates, waiver, and lifecycle of compliance deadlines.
"""

import logging
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.compliance import (
    ComplianceAuditLog,
    ComplianceDeadline,
    ContractClause,
)
from app.models.enums import DeadlineStatus, DeadlineType, Severity, TriggerEventType

from .calculator import calculate_deadline
from .severity import classify_severity, severity_escalated

logger = logging.getLogger(__name__)


async def create_deadline(
    db: AsyncSession,
    project_id: str,
    clause_id: str,
    trigger_event_type: TriggerEventType,
    trigger_description: str,
    triggered_at: datetime,
    trigger_event_id: str | None = None,
    triggered_by: str | None = None,
) -> ComplianceDeadline | None:
    """Create a new compliance deadline from a trigger event.

    Looks up the clause's deadline parameters and calculates the deadline date.
    """
    # Load clause
    result = await db.execute(
        select(ContractClause).where(
            ContractClause.id == clause_id,
            ContractClause.project_id == project_id,
        )
    )
    clause = result.scalar_one_or_none()
    if not clause:
        logger.warning("Clause %s not found", clause_id)
        return None

    if not clause.deadline_days or not clause.deadline_type:
        logger.warning("Clause %s has no deadline parameters", clause_id)
        return None

    # Calculate deadline date
    calc = await calculate_deadline(
        db,
        project_id,
        trigger_date=triggered_at,
        deadline_days=clause.deadline_days,
        deadline_type=clause.deadline_type,
        cure_period_days=clause.cure_period_days,
        cure_period_type=clause.cure_period_type,
    )

    deadline = ComplianceDeadline(
        project_id=project_id,
        clause_id=clause_id,
        trigger_event_type=trigger_event_type,
        trigger_event_id=trigger_event_id,
        trigger_description=trigger_description,
        triggered_at=triggered_at,
        triggered_by=triggered_by,
        calculated_deadline=calc["calculatedDeadline"],
        status=DeadlineStatus.ACTIVE,
        severity=calc["severity"],
    )
    db.add(deadline)
    await db.flush()
    await db.refresh(deadline)

    # Audit log
    audit = ComplianceAuditLog(
        project_id=project_id,
        event_type="DEADLINE_CREATED",
        entity_type="ComplianceDeadline",
        entity_id=deadline.id,
        user_id=triggered_by,
        actor_type="SYSTEM",
        action="create_deadline",
        details={
            "clauseId": clause_id,
            "clauseTitle": clause.title,
            "triggerType": trigger_event_type.value,
            "triggerDescription": trigger_description,
            "calculatedDeadline": calc["calculatedDeadline"].isoformat(),
            "severity": calc["severity"].value,
        },
    )
    db.add(audit)

    await db.flush()
    logger.info(
        "Created deadline %s for clause %s (due %s, severity %s)",
        deadline.id, clause_id,
        calc["calculatedDeadline"].isoformat(),
        calc["severity"].value,
    )
    return deadline


async def get_deadlines(
    db: AsyncSession,
    project_id: str,
    status: DeadlineStatus | None = None,
    severity: Severity | None = None,
) -> list[ComplianceDeadline]:
    """List deadlines for a project with optional filters."""
    query = (
        select(ComplianceDeadline)
        .where(ComplianceDeadline.project_id == project_id)
        .order_by(ComplianceDeadline.calculated_deadline.asc())
    )

    if status:
        query = query.where(ComplianceDeadline.status == status)
    if severity:
        query = query.where(ComplianceDeadline.severity == severity)

    result = await db.execute(query)
    return list(result.scalars().all())


async def get_deadline_by_id(
    db: AsyncSession,
    deadline_id: str,
    project_id: str,
) -> ComplianceDeadline | None:
    """Get a single deadline."""
    result = await db.execute(
        select(ComplianceDeadline).where(
            ComplianceDeadline.id == deadline_id,
            ComplianceDeadline.project_id == project_id,
        )
    )
    return result.scalar_one_or_none()


async def update_deadline_status(
    db: AsyncSession,
    deadline_id: str,
    project_id: str,
    new_status: DeadlineStatus,
    user_id: str | None = None,
    notice_id: str | None = None,
) -> ComplianceDeadline | None:
    """Update a deadline's status."""
    deadline = await get_deadline_by_id(db, deadline_id, project_id)
    if not deadline:
        return None

    old_status = deadline.status
    deadline.status = new_status

    if new_status == DeadlineStatus.NOTICE_DRAFTED and notice_id:
        deadline.notice_id = notice_id
        deadline.notice_created_at = datetime.utcnow()
    elif new_status == DeadlineStatus.NOTICE_SENT:
        pass  # sentAt tracked on the notice itself

    # Audit
    audit = ComplianceAuditLog(
        project_id=project_id,
        event_type="DEADLINE_STATUS_CHANGE",
        entity_type="ComplianceDeadline",
        entity_id=deadline_id,
        user_id=user_id,
        actor_type="USER" if user_id else "SYSTEM",
        action="update_status",
        details={
            "oldStatus": old_status.value,
            "newStatus": new_status.value,
            "noticeId": notice_id,
        },
    )
    db.add(audit)

    await db.flush()
    return deadline


async def waive_deadline(
    db: AsyncSession,
    deadline_id: str,
    project_id: str,
    user_id: str,
    reason: str,
) -> ComplianceDeadline | None:
    """Waive a deadline with reason tracking."""
    deadline = await get_deadline_by_id(db, deadline_id, project_id)
    if not deadline:
        return None

    deadline.status = DeadlineStatus.WAIVED
    deadline.waived_at = datetime.utcnow()
    deadline.waived_by = user_id
    deadline.waiver_reason = reason
    deadline.severity = Severity.LOW

    # Audit
    audit = ComplianceAuditLog(
        project_id=project_id,
        event_type="DEADLINE_WAIVED",
        entity_type="ComplianceDeadline",
        entity_id=deadline_id,
        user_id=user_id,
        actor_type="USER",
        action="waive_deadline",
        details={"reason": reason},
    )
    db.add(audit)

    await db.flush()
    return deadline


async def recalculate_severities(
    db: AsyncSession,
    project_id: str,
) -> dict:
    """Recalculate severity for all active deadlines in a project.

    Returns counts of changes by severity level.
    """
    now = datetime.utcnow()
    active_statuses = [DeadlineStatus.ACTIVE, DeadlineStatus.NOTICE_DRAFTED]

    result = await db.execute(
        select(ComplianceDeadline).where(
            ComplianceDeadline.project_id == project_id,
            ComplianceDeadline.status.in_(active_statuses),
        )
    )
    deadlines = result.scalars().all()

    changes = {"escalated": 0, "changed": 0, "expired": 0, "total": len(deadlines)}

    for deadline in deadlines:
        old_severity = deadline.severity
        new_severity = classify_severity(
            deadline.calculated_deadline, now, deadline.status
        )

        if old_severity != new_severity:
            deadline.severity = new_severity
            changes["changed"] += 1

            if severity_escalated(old_severity, new_severity):
                changes["escalated"] += 1

            if new_severity == Severity.EXPIRED:
                changes["expired"] += 1
                deadline.status = DeadlineStatus.EXPIRED

    if changes["changed"] > 0:
        await db.flush()
        logger.info(
            "Recalculated severities for project %s: %d changes, %d escalated, %d expired",
            project_id, changes["changed"], changes["escalated"], changes["expired"],
        )

    return changes
