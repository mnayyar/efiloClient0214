"""Compliance score calculation and history.

Calculates the compliance score based on notice delivery performance.
Formula: score = (onTimeCount / totalCount) * 100
Tracks streaks, claims values, and generates periodic snapshots.
"""

import logging
from datetime import datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.compliance import (
    ComplianceDeadline,
    ComplianceNotice,
    ComplianceScore,
    ComplianceScoreHistory,
)
from app.models.enums import (
    ComplianceNoticeStatus,
    DeadlineStatus,
    Severity,
)

logger = logging.getLogger(__name__)

# Default claims value per notice (used if no explicit value provided)
DEFAULT_CLAIMS_VALUE = Decimal("50000.00")


async def calculate_score(
    db: AsyncSession,
    project_id: str,
) -> ComplianceScore:
    """Calculate and upsert the compliance score for a project.

    Creates or updates the ComplianceScore record.
    """
    now = datetime.utcnow()

    # Count notices by on-time status
    sent_notices = await db.execute(
        select(ComplianceNotice).where(
            ComplianceNotice.project_id == project_id,
            ComplianceNotice.status.in_([
                ComplianceNoticeStatus.SENT,
                ComplianceNoticeStatus.ACKNOWLEDGED,
            ]),
        )
    )
    notices = sent_notices.scalars().all()

    total_count = len(notices)
    on_time_count = sum(1 for n in notices if n.on_time_status is True)
    missed_count = sum(1 for n in notices if n.on_time_status is False)

    # Score calculation
    score = round((on_time_count / total_count * 100)) if total_count > 0 else 100

    # Count active deadlines by severity
    active_deadlines = await db.execute(
        select(ComplianceDeadline).where(
            ComplianceDeadline.project_id == project_id,
            ComplianceDeadline.status.in_([
                DeadlineStatus.ACTIVE,
                DeadlineStatus.NOTICE_DRAFTED,
            ]),
        )
    )
    deadlines = active_deadlines.scalars().all()

    at_risk_count = sum(
        1 for d in deadlines
        if d.severity in (Severity.CRITICAL, Severity.WARNING)
    )
    active_count = len(deadlines)
    upcoming_count = sum(
        1 for d in deadlines
        if d.severity in (Severity.LOW, Severity.INFO)
    )

    # Claims value calculation
    protected_value = Decimal(on_time_count) * DEFAULT_CLAIMS_VALUE
    at_risk_value = Decimal(at_risk_count) * DEFAULT_CLAIMS_VALUE

    # Calculate streak
    streak = _calculate_streak(notices)

    # Upsert score record
    existing = await db.execute(
        select(ComplianceScore)
        .where(ComplianceScore.project_id == project_id)
        .order_by(ComplianceScore.calculated_at.desc())
        .limit(1)
    )
    score_record = existing.scalar_one_or_none()

    if score_record:
        old_streak = score_record.current_streak
        score_record.score = score
        score_record.on_time_count = on_time_count
        score_record.total_count = total_count
        score_record.missed_count = missed_count
        score_record.at_risk_count = at_risk_count
        score_record.active_count = active_count
        score_record.upcoming_count = upcoming_count
        score_record.protected_claims_value = protected_value
        score_record.at_risk_value = at_risk_value
        score_record.current_streak = streak
        score_record.best_streak = max(score_record.best_streak, streak)
        score_record.last_calculated_at = now
        score_record.calculated_at = now
        score_record.details = _build_details(
            score, on_time_count, total_count, missed_count,
            at_risk_count, active_count, streak,
        )

        # Track streak broken
        if streak < old_streak and old_streak > 0:
            score_record.streak_broken_at = now
    else:
        score_record = ComplianceScore(
            project_id=project_id,
            score=score,
            details=_build_details(
                score, on_time_count, total_count, missed_count,
                at_risk_count, active_count, streak,
            ),
            current_streak=streak,
            best_streak=streak,
            protected_claims_value=protected_value,
            at_risk_value=at_risk_value,
            on_time_count=on_time_count,
            total_count=total_count,
            missed_count=missed_count,
            at_risk_count=at_risk_count,
            active_count=active_count,
            upcoming_count=upcoming_count,
            last_calculated_at=now,
            calculated_at=now,
        )
        db.add(score_record)

    await db.flush()
    logger.info(
        "Score for project %s: %d%% (%d/%d on time, streak %d)",
        project_id, score, on_time_count, total_count, streak,
    )
    return score_record


async def create_score_snapshot(
    db: AsyncSession,
    project_id: str,
    period_type: str = "daily",
) -> ComplianceScoreHistory:
    """Create a point-in-time snapshot of the compliance score."""
    now = datetime.utcnow()

    # Get current score
    score = await calculate_score(db, project_id)

    # Count notices sent in the period (last 24h for daily, 7d for weekly)
    from datetime import timedelta
    period_hours = 24 if period_type == "daily" else 168
    period_start = now - timedelta(hours=period_hours)

    notices_in_period = await db.execute(
        select(func.count(ComplianceNotice.id)).where(
            ComplianceNotice.project_id == project_id,
            ComplianceNotice.sent_at >= period_start,
            ComplianceNotice.status.in_([
                ComplianceNoticeStatus.SENT,
                ComplianceNoticeStatus.ACKNOWLEDGED,
            ]),
        )
    )
    count = notices_in_period.scalar() or 0

    # Check for existing snapshot (upsert)
    existing = await db.execute(
        select(ComplianceScoreHistory).where(
            ComplianceScoreHistory.project_id == project_id,
            ComplianceScoreHistory.snapshot_date == now.replace(
                hour=0, minute=0, second=0, microsecond=0
            ),
            ComplianceScoreHistory.period_type == period_type,
        )
    )
    snapshot = existing.scalar_one_or_none()

    snapshot_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    percentage = Decimal(str(score.score))

    if snapshot:
        snapshot.compliance_percentage = percentage
        snapshot.on_time_count = score.on_time_count
        snapshot.total_count = score.total_count
        snapshot.notices_sent_in_period = count
        snapshot.protected_claims_value = score.protected_claims_value
    else:
        snapshot = ComplianceScoreHistory(
            project_id=project_id,
            snapshot_date=snapshot_date,
            compliance_percentage=percentage,
            on_time_count=score.on_time_count,
            total_count=score.total_count,
            notices_sent_in_period=count,
            protected_claims_value=score.protected_claims_value,
            period_type=period_type,
        )
        db.add(snapshot)

    await db.flush()
    return snapshot


async def get_score_history(
    db: AsyncSession,
    project_id: str,
    period_type: str = "daily",
    limit: int = 30,
) -> list[ComplianceScoreHistory]:
    """Get compliance score history for trending."""
    result = await db.execute(
        select(ComplianceScoreHistory)
        .where(
            ComplianceScoreHistory.project_id == project_id,
            ComplianceScoreHistory.period_type == period_type,
        )
        .order_by(ComplianceScoreHistory.snapshot_date.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


def _calculate_streak(notices: list[ComplianceNotice]) -> int:
    """Calculate current consecutive on-time streak.

    Sorts notices by sent_at descending and counts consecutive on-time notices.
    """
    if not notices:
        return 0

    sorted_notices = sorted(
        [n for n in notices if n.sent_at],
        key=lambda n: n.sent_at,
        reverse=True,
    )

    streak = 0
    for notice in sorted_notices:
        if notice.on_time_status is True:
            streak += 1
        else:
            break

    return streak


def _build_details(
    score: int,
    on_time: int,
    total: int,
    missed: int,
    at_risk: int,
    active: int,
    streak: int,
) -> dict:
    """Build the JSON details blob for the score record."""
    return {
        "score": score,
        "onTimeCount": on_time,
        "totalCount": total,
        "missedCount": missed,
        "atRiskCount": at_risk,
        "activeDeadlines": active,
        "currentStreak": streak,
        "formula": "onTimeCount / totalCount * 100",
    }
