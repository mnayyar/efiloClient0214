"""Compliance engine Celery cron tasks.

Three scheduled tasks:
  1. Hourly:  Recalculate deadline severities, send alerts
  2. Daily:   Snapshot compliance scores for all projects (2 AM)
  3. Weekly:  Send compliance summary emails (Monday 8 AM)

Plus on-demand tasks triggered by events.
"""

import logging

from celery import shared_task
from sqlalchemy import select

from app.db.session import sync_session_factory
from app.models.compliance import ComplianceDeadline, ComplianceScore
from app.models.enums import DeadlineStatus, Severity
from app.models.notification import Notification
from app.models.project import Project
from app.models.user import User
from app.models.enums import (
    NotificationChannel,
    NotificationSeverity,
    NotificationType,
    UserRole,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Hourly: Severity recalculation + alerts
# ---------------------------------------------------------------------------

@shared_task(name="compliance.severity_cron", bind=True, max_retries=2)
def compliance_severity_cron(self) -> dict:
    """Hourly: recalculate deadline severities and send alerts."""
    try:
        return _run_severity_cron()
    except Exception as exc:
        logger.exception("Compliance severity cron failed")
        raise self.retry(exc=exc, countdown=120)


def _run_severity_cron() -> dict:
    """Execute severity recalculation and alerting."""
    from datetime import datetime

    now = datetime.utcnow()
    total_updated = 0
    total_expired = 0
    total_alerts = 0

    with sync_session_factory() as session:
        # Get all projects with active deadlines
        project_ids = session.execute(
            select(ComplianceDeadline.project_id)
            .where(ComplianceDeadline.status.in_([
                DeadlineStatus.ACTIVE,
                DeadlineStatus.NOTICE_DRAFTED,
            ]))
            .distinct()
        )
        pids = [row[0] for row in project_ids.all()]

        for project_id in pids:
            # Get active deadlines
            result = session.execute(
                select(ComplianceDeadline).where(
                    ComplianceDeadline.project_id == project_id,
                    ComplianceDeadline.status.in_([
                        DeadlineStatus.ACTIVE,
                        DeadlineStatus.NOTICE_DRAFTED,
                    ]),
                )
            )
            deadlines = result.scalars().all()

            for deadline in deadlines:
                old_severity = deadline.severity

                # Recalculate severity
                remaining = deadline.calculated_deadline - now
                days = remaining.total_seconds() / 86400

                if deadline.calculated_deadline <= now:
                    new_severity = Severity.EXPIRED
                elif days <= 3:
                    new_severity = Severity.CRITICAL
                elif days <= 7:
                    new_severity = Severity.WARNING
                elif days <= 14:
                    new_severity = Severity.INFO
                else:
                    new_severity = Severity.LOW

                if old_severity != new_severity:
                    deadline.severity = new_severity
                    total_updated += 1

                    if new_severity == Severity.EXPIRED:
                        deadline.status = DeadlineStatus.EXPIRED
                        total_expired += 1

                # Send alerts for CRITICAL/EXPIRED
                if new_severity in (Severity.CRITICAL, Severity.WARNING, Severity.EXPIRED):
                    # Get clause info
                    from app.models.compliance import ContractClause
                    clause = session.execute(
                        select(ContractClause.title, ContractClause.section_ref)
                        .where(ContractClause.id == deadline.clause_id)
                    ).one_or_none()

                    clause_title = clause[0] if clause else "Unknown"
                    clause_ref = clause[1] if clause else ""

                    days_remaining = int(days)
                    label = (
                        "EXPIRED" if days_remaining < 0
                        else f"{days_remaining} day{'s' if days_remaining != 1 else ''} remaining"
                    )

                    title = f"{new_severity.value}: {clause_title}"
                    message = f"Notice due {label} — {clause_ref or 'N/A'}. {deadline.trigger_description}"

                    # Create in-app notification for relevant users
                    users = session.execute(
                        select(User).where(
                            User.role.in_([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.EXECUTIVE])
                        )
                    ).scalars().all()

                    for user in users:
                        sev = NotificationSeverity.CRITICAL if new_severity in (Severity.CRITICAL, Severity.EXPIRED) else NotificationSeverity.WARNING
                        notification = Notification(
                            user_id=user.id,
                            type=NotificationType.COMPLIANCE_DEADLINE,
                            severity=sev,
                            channel=NotificationChannel.IN_APP,
                            title=title,
                            message=message,
                            project_id=deadline.project_id,
                            entity_id=deadline.id,
                            entity_type="ComplianceDeadline",
                        )
                        session.add(notification)
                        total_alerts += 1

        session.commit()

    logger.info(
        "Severity cron: %d updated, %d expired, %d alerts sent",
        total_updated, total_expired, total_alerts,
    )
    return {
        "updated": total_updated,
        "expired": total_expired,
        "alertsSent": total_alerts,
    }


# ---------------------------------------------------------------------------
# Daily: Score snapshot (2 AM)
# ---------------------------------------------------------------------------

@shared_task(name="compliance.daily_snapshot", bind=True, max_retries=2)
def compliance_daily_snapshot(self) -> dict:
    """Daily: snapshot compliance scores for all active projects."""
    try:
        return _run_daily_snapshot()
    except Exception as exc:
        logger.exception("Compliance daily snapshot failed")
        raise self.retry(exc=exc, countdown=120)


def _run_daily_snapshot() -> dict:
    """Create daily score snapshots."""
    from datetime import datetime
    from decimal import Decimal

    from app.models.compliance import (
        ComplianceNotice,
        ComplianceScoreHistory,
    )
    from app.models.enums import ComplianceNoticeStatus

    now = datetime.utcnow()
    snapshot_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    snapshot_count = 0

    with sync_session_factory() as session:
        # Get all projects
        projects = session.execute(
            select(Project.id)
        ).scalars().all()

        for project_id in projects:
            # Get sent notices
            notices = session.execute(
                select(ComplianceNotice).where(
                    ComplianceNotice.project_id == project_id,
                    ComplianceNotice.status.in_([
                        ComplianceNoticeStatus.SENT,
                        ComplianceNoticeStatus.ACKNOWLEDGED,
                    ]),
                )
            ).scalars().all()

            total_count = len(notices)
            on_time_count = sum(1 for n in notices if n.on_time_status is True)
            score_pct = Decimal(str(round(on_time_count / total_count * 100))) if total_count > 0 else Decimal("100")

            # Claims value
            protected_value = Decimal(on_time_count) * Decimal("50000")

            # Notices sent in last 24h
            from datetime import timedelta
            period_start = now - timedelta(hours=24)
            sent_in_period = sum(
                1 for n in notices if n.sent_at and n.sent_at >= period_start
            )

            # Check for existing snapshot
            existing = session.execute(
                select(ComplianceScoreHistory).where(
                    ComplianceScoreHistory.project_id == project_id,
                    ComplianceScoreHistory.snapshot_date == snapshot_date,
                    ComplianceScoreHistory.period_type == "daily",
                )
            ).scalar_one_or_none()

            if existing:
                existing.compliance_percentage = score_pct
                existing.on_time_count = on_time_count
                existing.total_count = total_count
                existing.notices_sent_in_period = sent_in_period
                existing.protected_claims_value = protected_value
            else:
                snapshot = ComplianceScoreHistory(
                    project_id=project_id,
                    snapshot_date=snapshot_date,
                    compliance_percentage=score_pct,
                    on_time_count=on_time_count,
                    total_count=total_count,
                    notices_sent_in_period=sent_in_period,
                    protected_claims_value=protected_value,
                    period_type="daily",
                )
                session.add(snapshot)

            snapshot_count += 1

        session.commit()

    logger.info("Daily snapshot: %d projects", snapshot_count)
    return {"snapshotCount": snapshot_count}


# ---------------------------------------------------------------------------
# Weekly: Compliance summary (Monday 8 AM)
# ---------------------------------------------------------------------------

@shared_task(name="compliance.weekly_summary", bind=True, max_retries=2)
def compliance_weekly_summary(self) -> dict:
    """Weekly: send compliance summary emails to project teams."""
    try:
        return _run_weekly_summary()
    except Exception as exc:
        logger.exception("Compliance weekly summary failed")
        raise self.retry(exc=exc, countdown=120)


def _run_weekly_summary() -> dict:
    """Send weekly summaries and create weekly snapshots."""
    from datetime import datetime, timedelta
    from decimal import Decimal

    from app.models.compliance import (
        ComplianceNotice,
        ComplianceScoreHistory,
        ContractClause,
    )
    from app.models.enums import ComplianceNoticeStatus
    from app.services.email import send_rfi_email

    now = datetime.utcnow()
    summaries_sent = 0

    with sync_session_factory() as session:
        projects = session.execute(
            select(Project).select_from(Project)
        ).scalars().all()

        for project in projects:
            # Get score
            score = session.execute(
                select(ComplianceScore)
                .where(ComplianceScore.project_id == project.id)
                .order_by(ComplianceScore.calculated_at.desc())
                .limit(1)
            ).scalar_one_or_none()

            # Get upcoming deadlines (next 14 days)
            cutoff = now + timedelta(days=14)
            upcoming = session.execute(
                select(ComplianceDeadline)
                .where(
                    ComplianceDeadline.project_id == project.id,
                    ComplianceDeadline.status == DeadlineStatus.ACTIVE,
                    ComplianceDeadline.calculated_deadline <= cutoff,
                )
                .order_by(ComplianceDeadline.calculated_deadline.asc())
                .limit(10)
            ).scalars().all()

            # Format
            pct = "N/A"
            if score and score.total_count > 0:
                pct = f"{round(score.on_time_count / score.total_count * 100)}%"

            deadline_lines = []
            for d in upcoming:
                clause = session.execute(
                    select(ContractClause.title, ContractClause.section_ref)
                    .where(ContractClause.id == d.clause_id)
                ).one_or_none()
                ct = clause[0] if clause else "Unknown"
                cr = clause[1] if clause else "N/A"
                days = int((d.calculated_deadline - now).total_seconds() / 86400)
                sev = "CRITICAL" if days <= 3 else "WARNING" if days <= 7 else "INFO"
                deadline_lines.append(f"[{sev}] {ct} ({cr}) — {days} days")

            text = (
                f"Weekly Compliance Summary — {project.name}\n\n"
                f"PERFORMANCE\n"
                f"- Compliance Score: {pct} ({score.on_time_count if score else 0}/{score.total_count if score else 0} on time)\n"
                f"- Current Streak: {score.current_streak if score else 0} consecutive\n"
                f"- Claims Protected: ${int(score.protected_claims_value) if score else 0:,}\n\n"
                f"UPCOMING DEADLINES (Next 14 Days)\n"
                f"{chr(10).join(deadline_lines) if deadline_lines else 'No upcoming deadlines.'}"
            )

            # Send to relevant users
            users = session.execute(
                select(User).where(
                    User.role.in_([UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.EXECUTIVE])
                )
            ).scalars().all()

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

            # Weekly score snapshot
            notices = session.execute(
                select(ComplianceNotice).where(
                    ComplianceNotice.project_id == project.id,
                    ComplianceNotice.status.in_([
                        ComplianceNoticeStatus.SENT,
                        ComplianceNoticeStatus.ACKNOWLEDGED,
                    ]),
                )
            ).scalars().all()

            total_count = len(notices)
            on_time_count = sum(1 for n in notices if n.on_time_status is True)
            score_pct = Decimal(str(round(on_time_count / total_count * 100))) if total_count > 0 else Decimal("100")
            protected_value = Decimal(on_time_count) * Decimal("50000")

            period_start = now - timedelta(days=7)
            sent_in_period = sum(
                1 for n in notices if n.sent_at and n.sent_at >= period_start
            )

            snapshot_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
            existing_snapshot = session.execute(
                select(ComplianceScoreHistory).where(
                    ComplianceScoreHistory.project_id == project.id,
                    ComplianceScoreHistory.snapshot_date == snapshot_date,
                    ComplianceScoreHistory.period_type == "weekly",
                )
            ).scalar_one_or_none()

            if not existing_snapshot:
                snapshot = ComplianceScoreHistory(
                    project_id=project.id,
                    snapshot_date=snapshot_date,
                    compliance_percentage=score_pct,
                    on_time_count=on_time_count,
                    total_count=total_count,
                    notices_sent_in_period=sent_in_period,
                    protected_claims_value=protected_value,
                    period_type="weekly",
                )
                session.add(snapshot)

            summaries_sent += 1

        session.commit()

    logger.info("Weekly summary: %d projects", summaries_sent)
    return {"summariesSent": summaries_sent}
