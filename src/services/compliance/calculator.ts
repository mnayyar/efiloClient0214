import type { DeadlineType } from "@prisma/client";
import { getExcludedDates, isBusinessDay } from "./holidays";

// ── Types ─────────────────────────────────────────────────────────────────

interface DeadlineCalculationParams {
  triggerDate: Date;
  deadlineDays: number;
  deadlineType: DeadlineType;
  curePeriodDays?: number;
  curePeriodType?: DeadlineType;
  projectId: string;
}

interface DeadlineCalculationResult {
  calculatedDeadline: Date;
  curePeriodEndDate?: Date;
  businessDaysCount?: number;
  calendarDaysCount: number;
}

// ── Core calculator ───────────────────────────────────────────────────────

/** Calculate deadline based on trigger date and contractual rules. */
export async function calculateDeadline(
  params: DeadlineCalculationParams
): Promise<DeadlineCalculationResult> {
  const {
    triggerDate,
    deadlineDays,
    deadlineType,
    curePeriodDays,
    curePeriodType,
    projectId,
  } = params;

  let startDate = new Date(triggerDate);
  let curePeriodEndDate: Date | undefined;

  // Handle cure period if present
  if (curePeriodDays && curePeriodDays > 0) {
    const cureType = curePeriodType || deadlineType;
    curePeriodEndDate =
      cureType === "CALENDAR_DAYS"
        ? addCalendarDays(startDate, curePeriodDays)
        : await addBusinessDays(startDate, curePeriodDays, projectId);
    startDate = curePeriodEndDate;
  }

  // Calculate deadline from start date
  let calculatedDeadline: Date;
  let businessDaysCount: number | undefined;

  if (deadlineType === "HOURS") {
    calculatedDeadline = new Date(startDate);
    calculatedDeadline.setTime(
      calculatedDeadline.getTime() + deadlineDays * 60 * 60 * 1000
    );
  } else if (deadlineType === "CALENDAR_DAYS") {
    calculatedDeadline = addCalendarDays(startDate, deadlineDays);
  } else {
    // BUSINESS_DAYS
    calculatedDeadline = await addBusinessDays(
      startDate,
      deadlineDays,
      projectId
    );
    businessDaysCount = deadlineDays;
  }

  // Set to end of day for non-HOURS deadlines
  if (deadlineType !== "HOURS") {
    calculatedDeadline.setHours(23, 59, 59, 999);
  }

  return {
    calculatedDeadline,
    curePeriodEndDate,
    businessDaysCount,
    calendarDaysCount: Math.ceil(
      (calculatedDeadline.getTime() - triggerDate.getTime()) /
        (1000 * 60 * 60 * 24)
    ),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Add calendar days to a date. */
export function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Add business days to a date (excluding weekends + holidays). */
export async function addBusinessDays(
  date: Date,
  days: number,
  projectId: string
): Promise<Date> {
  const endRange = new Date(date);
  endRange.setFullYear(endRange.getFullYear() + 1);

  const excludedDates = await getExcludedDates(projectId, date, endRange);

  const current = new Date(date);
  let count = 0;

  while (count < days) {
    current.setDate(current.getDate() + 1);
    if (isBusinessDay(current, excludedDates)) {
      count++;
    }
  }

  return current;
}

/** Calculate days remaining until deadline. */
export function calculateDaysRemaining(
  deadline: Date,
  now = new Date()
): number {
  const diffMs = deadline.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/** Calculate hours remaining until deadline. */
export function calculateHoursRemaining(
  deadline: Date,
  now = new Date()
): number {
  const diffMs = deadline.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60));
}
