"""Federal holidays and business day calculations.

Provides federal holiday dates, project-specific holidays, and business day
arithmetic for deadline calculations.
"""

from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.compliance import ProjectHoliday

# ---------------------------------------------------------------------------
# Federal holidays (US) — 2025-2027
# ---------------------------------------------------------------------------

FEDERAL_HOLIDAYS: dict[int, list[date]] = {
    2025: [
        date(2025, 1, 1),    # New Year's Day
        date(2025, 1, 20),   # MLK Jr. Day
        date(2025, 2, 17),   # Presidents' Day
        date(2025, 5, 26),   # Memorial Day
        date(2025, 6, 19),   # Juneteenth
        date(2025, 7, 4),    # Independence Day
        date(2025, 9, 1),    # Labor Day
        date(2025, 10, 13),  # Columbus Day
        date(2025, 11, 11),  # Veterans Day
        date(2025, 11, 27),  # Thanksgiving
        date(2025, 12, 25),  # Christmas
    ],
    2026: [
        date(2026, 1, 1),    # New Year's Day
        date(2026, 1, 19),   # MLK Jr. Day
        date(2026, 2, 16),   # Presidents' Day
        date(2026, 5, 25),   # Memorial Day
        date(2026, 6, 19),   # Juneteenth
        date(2026, 7, 3),    # Independence Day (observed)
        date(2026, 9, 7),    # Labor Day
        date(2026, 10, 12),  # Columbus Day
        date(2026, 11, 11),  # Veterans Day
        date(2026, 11, 26),  # Thanksgiving
        date(2026, 12, 25),  # Christmas
    ],
    2027: [
        date(2027, 1, 1),    # New Year's Day
        date(2027, 1, 18),   # MLK Jr. Day
        date(2027, 2, 15),   # Presidents' Day
        date(2027, 5, 31),   # Memorial Day
        date(2027, 6, 18),   # Juneteenth (observed)
        date(2027, 7, 5),    # Independence Day (observed)
        date(2027, 9, 6),    # Labor Day
        date(2027, 10, 11),  # Columbus Day
        date(2027, 11, 11),  # Veterans Day
        date(2027, 11, 25),  # Thanksgiving
        date(2027, 12, 24),  # Christmas (observed)
    ],
}


def get_federal_holidays(year: int) -> list[date]:
    """Get federal holidays for a given year."""
    return FEDERAL_HOLIDAYS.get(year, [])


async def get_project_holidays(
    db: AsyncSession,
    project_id: str,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[date]:
    """Get project-specific holidays from the database."""
    query = select(ProjectHoliday.date).where(
        ProjectHoliday.project_id == project_id,
    )
    if start_date:
        query = query.where(ProjectHoliday.date >= start_date)
    if end_date:
        query = query.where(ProjectHoliday.date <= end_date)

    result = await db.execute(query)
    return [row[0] for row in result.all()]


async def get_all_holidays(
    db: AsyncSession,
    project_id: str,
    start_date: date | None = None,
    end_date: date | None = None,
) -> set[date]:
    """Get combined federal + project holidays as a set."""
    holidays: set[date] = set()

    # Federal holidays for relevant years
    start_year = start_date.year if start_date else datetime.utcnow().year
    end_year = end_date.year if end_date else start_year + 1
    for year in range(start_year, end_year + 1):
        holidays.update(get_federal_holidays(year))

    # Project-specific holidays
    project_holidays = await get_project_holidays(
        db, project_id, start_date, end_date
    )
    holidays.update(project_holidays)

    return holidays


def is_business_day(d: date, holidays: set[date]) -> bool:
    """Check if a date is a business day (not weekend, not holiday)."""
    return d.weekday() < 5 and d not in holidays


def add_business_days(
    start: date,
    days: int,
    holidays: set[date],
) -> date:
    """Add business days to a start date, skipping weekends and holidays."""
    current = start
    remaining = days

    while remaining > 0:
        current += timedelta(days=1)
        if is_business_day(current, holidays):
            remaining -= 1

    return current


def add_calendar_days(start: date, days: int) -> date:
    """Add calendar days to a start date."""
    return start + timedelta(days=days)


def add_hours(start: datetime, hours: int) -> datetime:
    """Add hours to a start datetime."""
    return start + timedelta(hours=hours)


def count_business_days_between(
    start: date,
    end: date,
    holidays: set[date],
) -> int:
    """Count business days between two dates (exclusive of start, inclusive of end)."""
    count = 0
    current = start
    while current < end:
        current += timedelta(days=1)
        if is_business_day(current, holidays):
            count += 1
    return count
