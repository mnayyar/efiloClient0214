"""RFI aging Celery task.

Runs daily at 8 AM to flag overdue RFIs and send approaching-due reminders.
"""

import logging
from datetime import datetime, timedelta

from celery import shared_task
from sqlalchemy import select, update

from app.db.session import sync_session_factory
from app.models.enums import (
    NotificationChannel,
    NotificationSeverity,
    NotificationType,
    RFIStatus,
)
from app.models.notification import Notification
from app.models.rfi import RFI

logger = logging.getLogger(__name__)

# Statuses eligible for aging
AGING_STATUSES = [RFIStatus.SUBMITTED, RFIStatus.PENDING_GC, RFIStatus.OPEN]


@shared_task(name="rfi.aging", bind=True, max_retries=2)
def rfi_aging_check(self) -> dict:
    """Daily RFI aging: flag overdue, send approaching-due reminders."""
    try:
        return _run_aging()
    except Exception as exc:
        logger.exception("RFI aging check failed")
        raise self.retry(exc=exc, countdown=60)


def _run_aging() -> dict:
    """Execute the aging pipeline."""
    now = datetime.utcnow()
    overdue_flagged = 0
    approaching_reminders = 0

    with sync_session_factory() as session:
        # --- Step 1: Flag overdue RFIs ---
        result = session.execute(
            select(RFI).where(
                RFI.due_date < now,
                RFI.is_overdue == False,  # noqa: E712
                RFI.status.in_(AGING_STATUSES),
            )
        )
        overdue_rfis = result.scalars().all()

        for rfi in overdue_rfis:
            rfi.is_overdue = True

            # Create notification
            notification = Notification(
                user_id=rfi.created_by_id,
                type=NotificationType.RFI_OVERDUE,
                severity=NotificationSeverity.WARNING,
                channel=NotificationChannel.IN_APP,
                title=f"RFI {rfi.rfi_number} is overdue",
                message=f'"{rfi.subject}" has passed its response due date.',
                project_id=rfi.project_id,
                entity_id=rfi.id,
                entity_type="RFI",
            )
            session.add(notification)

        overdue_flagged = len(overdue_rfis)
        if overdue_flagged:
            logger.info("Flagged %d overdue RFIs", overdue_flagged)

        # --- Step 2: Approaching due (within 48 hours) ---
        cutoff = now + timedelta(hours=48)
        dedup_cutoff = now - timedelta(hours=24)

        result = session.execute(
            select(RFI).where(
                RFI.due_date > now,
                RFI.due_date <= cutoff,
                RFI.is_overdue == False,  # noqa: E712
                RFI.status.in_(AGING_STATUSES),
            )
        )
        approaching_rfis = result.scalars().all()

        for rfi in approaching_rfis:
            # Dedup: check if reminder already sent in last 24h
            existing = session.execute(
                select(Notification).where(
                    Notification.entity_id == rfi.id,
                    Notification.entity_type == "RFI",
                    Notification.type == NotificationType.RFI_RESPONSE_DUE,
                    Notification.created_at > dedup_cutoff,
                ).limit(1)
            )
            if existing.scalar_one_or_none():
                continue

            due_str = rfi.due_date.strftime("%b %d, %Y") if rfi.due_date else "soon"
            notification = Notification(
                user_id=rfi.created_by_id,
                type=NotificationType.RFI_RESPONSE_DUE,
                severity=NotificationSeverity.INFO,
                channel=NotificationChannel.IN_APP,
                title=f"RFI {rfi.rfi_number} response due soon",
                message=f'"{rfi.subject}" is due {due_str}.',
                project_id=rfi.project_id,
                entity_id=rfi.id,
                entity_type="RFI",
            )
            session.add(notification)
            approaching_reminders += 1

        if approaching_reminders:
            logger.info("Sent %d approaching-due reminders", approaching_reminders)

        session.commit()

    return {
        "overdueFlagged": overdue_flagged,
        "approachingReminders": approaching_reminders,
    }
