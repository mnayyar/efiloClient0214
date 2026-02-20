"""Deadline date calculation engine.

Calculates deadline dates from trigger events using clause parameters
(calendar days, business days, hours) and optional cure periods.
"""

from datetime import date, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import DeadlineType

from .holidays import (
    add_business_days,
    add_calendar_days,
    add_hours,
    get_all_holidays,
)
from .severity import classify_severity


async def calculate_deadline(
    db: AsyncSession,
    project_id: str,
    trigger_date: datetime,
    deadline_days: int,
    deadline_type: DeadlineType,
    cure_period_days: int | None = None,
    cure_period_type: DeadlineType | None = None,
) -> dict:
    """Calculate a deadline date from a trigger event.

    Returns dict with:
        - calculatedDeadline: datetime
        - severity: Severity enum value
        - cureDeadline: datetime | None (if cure period applies)
    """
    trigger_as_date = trigger_date.date() if isinstance(trigger_date, datetime) else trigger_date

    # Get holidays for business day calculations
    holidays = await get_all_holidays(
        db, project_id,
        start_date=trigger_as_date,
    )

    # Calculate primary deadline
    if deadline_type == DeadlineType.BUSINESS_DAYS:
        deadline_date = add_business_days(trigger_as_date, deadline_days, holidays)
        calculated_deadline = datetime.combine(deadline_date, datetime.max.time().replace(microsecond=0))
    elif deadline_type == DeadlineType.HOURS:
        calculated_deadline = add_hours(trigger_date, deadline_days)
    else:  # CALENDAR_DAYS
        deadline_date = add_calendar_days(trigger_as_date, deadline_days)
        calculated_deadline = datetime.combine(deadline_date, datetime.max.time().replace(microsecond=0))

    # Calculate cure period deadline (if applicable)
    cure_deadline = None
    if cure_period_days and cure_period_type:
        if cure_period_type == DeadlineType.BUSINESS_DAYS:
            cure_date = add_business_days(
                calculated_deadline.date(), cure_period_days, holidays
            )
            cure_deadline = datetime.combine(cure_date, datetime.max.time().replace(microsecond=0))
        elif cure_period_type == DeadlineType.HOURS:
            cure_deadline = add_hours(calculated_deadline, cure_period_days)
        else:  # CALENDAR_DAYS
            cure_date = add_calendar_days(
                calculated_deadline.date(), cure_period_days
            )
            cure_deadline = datetime.combine(cure_date, datetime.max.time().replace(microsecond=0))

    # Classify severity
    severity = classify_severity(calculated_deadline)

    return {
        "calculatedDeadline": calculated_deadline,
        "severity": severity,
        "cureDeadline": cure_deadline,
    }
