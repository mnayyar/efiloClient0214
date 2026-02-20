"""Deadline severity classification.

Classifies deadlines by time remaining:
  EXPIRED:  Past deadline
  CRITICAL: <= 3 days remaining
  WARNING:  3-7 days remaining
  INFO:     7-14 days remaining
  LOW:      > 14 days remaining
"""

from datetime import datetime

from app.models.enums import DeadlineStatus, Severity


# Thresholds in days
CRITICAL_THRESHOLD_DAYS = 3
WARNING_THRESHOLD_DAYS = 7
INFO_THRESHOLD_DAYS = 14


def classify_severity(
    deadline: datetime,
    now: datetime | None = None,
    status: DeadlineStatus | None = None,
) -> Severity:
    """Classify a deadline's severity based on time remaining.

    Args:
        deadline: The calculated deadline datetime.
        now: Current time (defaults to utcnow).
        status: Current deadline status. Terminal statuses return LOW.
    """
    # Terminal statuses don't need severity updates
    if status in (
        DeadlineStatus.COMPLETED,
        DeadlineStatus.WAIVED,
        DeadlineStatus.NOTICE_SENT,
    ):
        return Severity.LOW

    if now is None:
        now = datetime.utcnow()

    # Already expired
    if deadline <= now:
        return Severity.EXPIRED

    remaining = deadline - now
    days_remaining = remaining.total_seconds() / 86400

    if days_remaining <= CRITICAL_THRESHOLD_DAYS:
        return Severity.CRITICAL
    elif days_remaining <= WARNING_THRESHOLD_DAYS:
        return Severity.WARNING
    elif days_remaining <= INFO_THRESHOLD_DAYS:
        return Severity.INFO
    else:
        return Severity.LOW


def severity_changed(old: Severity, new: Severity) -> bool:
    """Check if severity has changed (for triggering notifications)."""
    return old != new


def severity_escalated(old: Severity, new: Severity) -> bool:
    """Check if severity has escalated (more urgent)."""
    order = {
        Severity.LOW: 0,
        Severity.INFO: 1,
        Severity.WARNING: 2,
        Severity.CRITICAL: 3,
        Severity.EXPIRED: 4,
    }
    return order.get(new, 0) > order.get(old, 0)
