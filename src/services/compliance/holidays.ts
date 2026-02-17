import { prisma } from "@/lib/db";

/**
 * Federal holidays — update annually or fetch from external source.
 */
export const FEDERAL_HOLIDAYS: Record<number, string[]> = {
  2025: [
    "2025-01-01", // New Year's Day
    "2025-01-20", // Martin Luther King Jr. Day
    "2025-02-17", // Presidents Day
    "2025-05-26", // Memorial Day
    "2025-06-19", // Juneteenth
    "2025-07-04", // Independence Day
    "2025-09-01", // Labor Day
    "2025-10-13", // Columbus Day
    "2025-11-11", // Veterans Day
    "2025-11-27", // Thanksgiving
    "2025-12-25", // Christmas
  ],
  2026: [
    "2026-01-01", // New Year's Day
    "2026-01-19", // Martin Luther King Jr. Day
    "2026-02-16", // Presidents Day
    "2026-05-25", // Memorial Day
    "2026-06-19", // Juneteenth
    "2026-07-03", // Independence Day (observed)
    "2026-09-07", // Labor Day
    "2026-10-12", // Columbus Day
    "2026-11-11", // Veterans Day
    "2026-11-26", // Thanksgiving
    "2026-12-25", // Christmas
  ],
  2027: [
    "2027-01-01", // New Year's Day
    "2027-01-18", // Martin Luther King Jr. Day
    "2027-02-15", // Presidents Day
    "2027-05-31", // Memorial Day
    "2027-06-18", // Juneteenth (observed)
    "2027-07-05", // Independence Day (observed)
    "2027-09-06", // Labor Day
    "2027-10-11", // Columbus Day
    "2027-11-11", // Veterans Day
    "2027-11-25", // Thanksgiving
    "2027-12-24", // Christmas (observed)
  ],
};

/** Get all federal holidays within a date range. */
export function getFederalHolidays(
  startDate: Date,
  endDate: Date
): Set<string> {
  const holidays = new Set<string>();
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();

  for (let year = startYear; year <= endYear; year++) {
    const yearHolidays = FEDERAL_HOLIDAYS[year];
    if (yearHolidays) {
      for (const h of yearHolidays) holidays.add(h);
    }
  }

  return holidays;
}

/** Get project-specific holidays from the database. */
export async function getProjectHolidays(
  projectId: string,
  startDate: Date,
  endDate: Date
): Promise<Set<string>> {
  const holidays = await prisma.projectHoliday.findMany({
    where: {
      projectId,
      date: { gte: startDate, lte: endDate },
    },
  });

  return new Set(holidays.map((h) => h.date.toISOString().split("T")[0]));
}

/** Get all excluded dates (weekends + federal + project holidays). */
export async function getExcludedDates(
  projectId: string,
  startDate: Date,
  endDate: Date
): Promise<Set<string>> {
  const excluded = new Set<string>();

  // Federal holidays
  const federal = getFederalHolidays(startDate, endDate);
  for (const h of federal) excluded.add(h);

  // Project holidays
  const project = await getProjectHolidays(projectId, startDate, endDate);
  for (const h of project) excluded.add(h);

  // Weekends
  const current = new Date(startDate);
  while (current <= endDate) {
    const day = current.getDay();
    if (day === 0 || day === 6) {
      excluded.add(current.toISOString().split("T")[0]);
    }
    current.setDate(current.getDate() + 1);
  }

  return excluded;
}

/** Check if a date is a business day. */
export function isBusinessDay(
  date: Date,
  excludedDates: Set<string>
): boolean {
  const dateStr = date.toISOString().split("T")[0];
  const day = date.getDay();
  return day !== 0 && day !== 6 && !excludedDates.has(dateStr);
}
