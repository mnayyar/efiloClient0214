"""Compliance deadline alerting and weekly summary emails.

Sends in-app notifications and emails for CRITICAL/EXPIRED deadlines,
and generates weekly compliance summary emails for project teams.
"""

import html
import logging
from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.compliance import ComplianceDeadline, ComplianceScore, ContractClause
from app.models.enums import (
    DeadlineStatus,
    NotificationChannel,
    NotificationSeverity,
    NotificationType,
    Severity,
    UserRole,
)
from app.models.notification import Notification
from app.models.project import Project
from app.models.user import User
from app.services.email import send_rfi_email

logger = logging.getLogger(__name__)


def _calculate_days_remaining(deadline: datetime) -> int:
    """Calculate days remaining until deadline (negative = expired)."""
    remaining = deadline - datetime.utcnow()
    return int(remaining.total_seconds() / 86400)


def _map_severity(s: Severity) -> NotificationSeverity:
    """Map compliance severity to notification severity."""
    if s in (Severity.CRITICAL, Severity.EXPIRED):
        return NotificationSeverity.CRITICAL
    if s == Severity.WARNING:
        return NotificationSeverity.WARNING
    return NotificationSeverity.INFO


async def check_deadlines_for_alerts(db: AsyncSession) -> dict:
    """Check all active CRITICAL/WARNING/EXPIRED deadlines and send alerts."""
    result = await db.execute(
        select(ComplianceDeadline).where(
            ComplianceDeadline.status == DeadlineStatus.ACTIVE,
            ComplianceDeadline.severity.in_([
                Severity.CRITICAL,
                Severity.WARNING,
                Severity.EXPIRED,
            ]),
        )
    )
    deadlines = result.scalars().all()

    alerts_sent = 0

    for deadline in deadlines:
        # Load clause info
        clause_result = await db.execute(
            select(ContractClause.title, ContractClause.section_ref)
            .where(ContractClause.id == deadline.clause_id)
        )
        clause_row = clause_result.one_or_none()
        clause_title = clause_row[0] if clause_row else "Unknown"
        clause_ref = clause_row[1] if clause_row else ""

        days_remaining = _calculate_days_remaining(deadline.calculated_deadline)
        label = (
            "EXPIRED"
            if days_remaining < 0
            else f"{days_remaining} day{'s' if days_remaining != 1 else ''} remaining"
        )

        title = f"{deadline.severity.value}: {clause_title}"
        message = (
            f"Notice due {label} — {clause_ref or 'N/A'}. "
            f"{deadline.trigger_description}"
        )

        # Get relevant users (admins, PMs, executives)
        users_result = await db.execute(
            select(User).where(
                User.role.in_([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.EXECUTIVE])
            )
        )
        users = users_result.scalars().all()

        for user in users:
            # In-app notification
            notification = Notification(
                user_id=user.id,
                type=NotificationType.COMPLIANCE_DEADLINE,
                severity=_map_severity(deadline.severity),
                channel=NotificationChannel.IN_APP,
                title=title,
                message=message,
                project_id=deadline.project_id,
                entity_id=deadline.id,
                entity_type="ComplianceDeadline",
            )
            db.add(notification)

            # Email for CRITICAL and EXPIRED
            if deadline.severity in (Severity.CRITICAL, Severity.EXPIRED):
                _send_alert_email(
                    user_email=user.email,
                    user_name=user.name,
                    title=title,
                    message=message,
                    severity=deadline.severity,
                    deadline_date=deadline.calculated_deadline,
                )

            alerts_sent += 1

    if alerts_sent:
        await db.flush()
        logger.info("Sent %d compliance deadline alerts", alerts_sent)

    return {"alertsSent": alerts_sent}


async def send_weekly_compliance_summary(
    db: AsyncSession,
    project_id: str,
) -> None:
    """Send weekly compliance summary email to project team."""
    # Load project
    project_result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = project_result.scalar_one_or_none()
    if not project:
        return

    # Get latest score
    score_result = await db.execute(
        select(ComplianceScore)
        .where(ComplianceScore.project_id == project_id)
        .order_by(ComplianceScore.calculated_at.desc())
        .limit(1)
    )
    score = score_result.scalar_one_or_none()

    # Get upcoming deadlines (next 14 days)
    cutoff = datetime.utcnow() + timedelta(days=14)
    deadline_result = await db.execute(
        select(ComplianceDeadline)
        .where(
            ComplianceDeadline.project_id == project_id,
            ComplianceDeadline.status == DeadlineStatus.ACTIVE,
            ComplianceDeadline.calculated_deadline <= cutoff,
        )
        .order_by(ComplianceDeadline.calculated_deadline.asc())
        .limit(10)
    )
    upcoming = deadline_result.scalars().all()

    # Format score
    if score and score.total_count > 0:
        percentage = f"{round(score.on_time_count / score.total_count * 100)}%"
    else:
        percentage = "N/A"

    # Format deadline lines
    deadline_lines = []
    for d in upcoming:
        clause_result = await db.execute(
            select(ContractClause.title, ContractClause.section_ref)
            .where(ContractClause.id == d.clause_id)
        )
        row = clause_result.one_or_none()
        clause_title = row[0] if row else "Unknown"
        clause_ref = row[1] if row else "N/A"

        days = _calculate_days_remaining(d.calculated_deadline)
        sev = "CRITICAL" if days <= 3 else "WARNING" if days <= 7 else "INFO"
        deadline_lines.append(f"[{sev}] {clause_title} ({clause_ref}) — {days} days")

    text = f"""Weekly Compliance Summary — {project.name}

PERFORMANCE
- Compliance Score: {percentage} ({score.on_time_count if score else 0}/{score.total_count if score else 0} on time)
- Current Streak: {score.current_streak if score else 0} consecutive
- Claims Protected: ${int(score.protected_claims_value) if score else 0:,}

UPCOMING DEADLINES (Next 14 Days)
{chr(10).join(deadline_lines) if deadline_lines else 'No upcoming deadlines.'}"""

    # Send to relevant users
    users_result = await db.execute(
        select(User).where(
            User.role.in_([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.EXECUTIVE])
        )
    )
    users = users_result.scalars().all()

    for user in users:
        send_rfi_email(
            from_name="efilo.ai",
            from_email="noreply@efilo.ai",
            reply_to="noreply@efilo.ai",
            to=user.email,
            to_name=user.name,
            rfi_number="COMPLIANCE",
            subject=f"[efilo] Weekly Compliance Summary — {project.name}",
            question=text,
            project_name=project.name,
        )


def _send_alert_email(
    *,
    user_email: str,
    user_name: str,
    title: str,
    message: str,
    severity: Severity,
    deadline_date: datetime,
) -> None:
    """Send a compliance alert email."""
    send_rfi_email(
        from_name="efilo.ai Compliance",
        from_email="noreply@efilo.ai",
        reply_to="noreply@efilo.ai",
        to=user_email,
        to_name=user_name,
        rfi_number="ALERT",
        subject=f"[efilo] {title}",
        question=(
            f"{message}\n\n"
            f"Deadline: {deadline_date.strftime('%A, %B %d, %Y')}\n\n"
            f"Log in to efilo to draft and send the required notice."
        ),
        project_name="Compliance Alert",
    )
