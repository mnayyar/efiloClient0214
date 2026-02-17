# PHASE3_DEADLINES.md - Deadline Calculation Engine

## Objective
Build the core deadline calculation engine that handles calendar days, business days, holidays, cure periods, and severity classification.

## Duration: 3-4 days

## Prerequisites
- Phase 1 database schema complete
- Phase 2 contract parsing complete
- ContractClause records exist in database

---

## Task 1: Create Holiday Configuration

Create `src/compliance/deadlines/holidays.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Federal holidays for multiple years
 * Update annually or fetch from external source
 */
export const FEDERAL_HOLIDAYS: Record<number, string[]> = {
  2025: [
    '2025-01-01', // New Year's Day
    '2025-01-20', // Martin Luther King Jr. Day
    '2025-02-17', // Presidents Day
    '2025-05-26', // Memorial Day
    '2025-06-19', // Juneteenth
    '2025-07-04', // Independence Day
    '2025-09-01', // Labor Day
    '2025-10-13', // Columbus Day
    '2025-11-11', // Veterans Day
    '2025-11-27', // Thanksgiving
    '2025-12-25', // Christmas
  ],
  2026: [
    '2026-01-01', // New Year's Day
    '2026-01-19', // Martin Luther King Jr. Day
    '2026-02-16', // Presidents Day
    '2026-05-25', // Memorial Day
    '2026-06-19', // Juneteenth
    '2026-07-03', // Independence Day (observed)
    '2026-09-07', // Labor Day
    '2026-10-12', // Columbus Day
    '2026-11-11', // Veterans Day
    '2026-11-26', // Thanksgiving
    '2026-12-25', // Christmas
  ],
  2027: [
    '2027-01-01', // New Year's Day
    '2027-01-18', // Martin Luther King Jr. Day
    '2027-02-15', // Presidents Day
    '2027-05-31', // Memorial Day
    '2027-06-18', // Juneteenth (observed)
    '2027-07-05', // Independence Day (observed)
    '2027-09-06', // Labor Day
    '2027-10-11', // Columbus Day
    '2027-11-11', // Veterans Day
    '2027-11-25', // Thanksgiving
    '2027-12-24', // Christmas (observed)
  ],
};

/**
 * Get all federal holidays for a date range
 */
export function getFederalHolidays(startDate: Date, endDate: Date): Set<string> {
  const holidays = new Set<string>();
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();

  for (let year = startYear; year <= endYear; year++) {
    const yearHolidays = FEDERAL_HOLIDAYS[year] || [];
    yearHolidays.forEach((h) => holidays.add(h));
  }

  return holidays;
}

/**
 * Get project-specific holidays
 */
export async function getProjectHolidays(
  projectId: string,
  startDate: Date,
  endDate: Date
): Promise<Set<string>> {
  const holidays = await prisma.projectHoliday.findMany({
    where: {
      projectId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  return new Set(holidays.map((h) => h.date.toISOString().split('T')[0]));
}

/**
 * Get all excluded dates (weekends + federal holidays + project holidays)
 */
export async function getExcludedDates(
  projectId: string,
  startDate: Date,
  endDate: Date
): Promise<Set<string>> {
  const excluded = new Set<string>();

  // Add federal holidays
  const federal = getFederalHolidays(startDate, endDate);
  federal.forEach((h) => excluded.add(h));

  // Add project holidays
  const project = await getProjectHolidays(projectId, startDate, endDate);
  project.forEach((h) => excluded.add(h));

  // Add weekends
  const current = new Date(startDate);
  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      // Sunday or Saturday
      excluded.add(current.toISOString().split('T')[0]);
    }
    current.setDate(current.getDate() + 1);
  }

  return excluded;
}

/**
 * Check if a date is a business day
 */
export function isBusinessDay(date: Date, excludedDates: Set<string>): boolean {
  const dateStr = date.toISOString().split('T')[0];
  const dayOfWeek = date.getDay();

  // Not a weekend and not in excluded dates
  return dayOfWeek !== 0 && dayOfWeek !== 6 && !excludedDates.has(dateStr);
}

/**
 * Add project holiday
 */
export async function addProjectHoliday(
  projectId: string,
  date: Date,
  name: string,
  description?: string,
  recurring = false
): Promise<void> {
  await prisma.projectHoliday.create({
    data: {
      projectId,
      date,
      name,
      description,
      recurring,
      source: 'MANUAL',
    },
  });
}
```

---

## Task 2: Create Deadline Calculator

Create `src/compliance/deadlines/calculator.ts`:

```typescript
import { DeadlineType, Severity } from '@prisma/client';
import { getExcludedDates, isBusinessDay } from './holidays';

interface DeadlineCalculationParams {
  triggerDate: Date;
  deadlineDays: number;
  deadlineType: DeadlineType;
  curePeriodDays?: number;
  curePeriodType?: DeadlineType;
  projectId: string;
  projectTimezone?: string;
}

interface DeadlineCalculationResult {
  calculatedDeadline: Date;
  curePeriodEndDate?: Date;
  businessDaysCount?: number;
  calendarDaysCount: number;
}

/**
 * Calculate deadline based on trigger date and deadline rules
 */
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

  // Step 1: Handle cure period if present
  if (curePeriodDays && curePeriodDays > 0) {
    const cureType = curePeriodType || deadlineType;

    if (cureType === 'CALENDAR') {
      curePeriodEndDate = addCalendarDays(startDate, curePeriodDays);
    } else {
      curePeriodEndDate = await addBusinessDays(startDate, curePeriodDays, projectId);
    }

    startDate = curePeriodEndDate;
  }

  // Step 2: Calculate deadline from start date
  let calculatedDeadline: Date;
  let businessDaysCount: number | undefined;

  if (deadlineType === 'CALENDAR') {
    calculatedDeadline = addCalendarDays(startDate, deadlineDays);
  } else {
    calculatedDeadline = await addBusinessDays(startDate, deadlineDays, projectId);
    businessDaysCount = deadlineDays;
  }

  // Step 3: Set time to end of day (11:59:59 PM)
  calculatedDeadline.setHours(23, 59, 59, 999);

  return {
    calculatedDeadline,
    curePeriodEndDate,
    businessDaysCount,
    calendarDaysCount: Math.ceil(
      (calculatedDeadline.getTime() - triggerDate.getTime()) / (1000 * 60 * 60 * 24)
    ),
  };
}

/**
 * Add calendar days to a date
 */
export function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Add business days to a date (excluding weekends and holidays)
 */
export async function addBusinessDays(
  date: Date,
  days: number,
  projectId: string
): Promise<Date> {
  // Get excluded dates for a wide range (1 year should be enough)
  const endRange = new Date(date);
  endRange.setFullYear(endRange.getFullYear() + 1);

  const excludedDates = await getExcludedDates(projectId, date, endRange);

  let current = new Date(date);
  let businessDaysCount = 0;

  while (businessDaysCount < days) {
    current.setDate(current.getDate() + 1);

    if (isBusinessDay(current, excludedDates)) {
      businessDaysCount++;
    }
  }

  return current;
}

/**
 * Calculate "prompt" (48-hour) deadline
 * Returns earlier of: 48 hours OR next business day 9 AM
 */
export async function calculatePromptDeadline(
  triggerDate: Date,
  projectId: string,
  projectTimezone = 'America/Los_Angeles'
): Promise<Date> {
  // Option 1: 48 hours from discovery
  const fortyEightHours = new Date(triggerDate);
  fortyEightHours.setTime(fortyEightHours.getTime() + 48 * 60 * 60 * 1000);

  // Option 2: Next business day at 9 AM
  const nextBusinessMorning = await getNextBusinessDayMorning(
    triggerDate,
    projectId,
    9, // 9 AM
    projectTimezone
  );

  // Return the earlier deadline
  return fortyEightHours < nextBusinessMorning ? fortyEightHours : nextBusinessMorning;
}

/**
 * Get next business day morning
 */
async function getNextBusinessDayMorning(
  date: Date,
  projectId: string,
  hour: number,
  timezone: string
): Promise<Date> {
  const endRange = new Date(date);
  endRange.setDate(endRange.getDate() + 14); // Max 2 weeks ahead

  const excludedDates = await getExcludedDates(projectId, date, endRange);

  let current = new Date(date);
  current.setDate(current.getDate() + 1); // Start with next day

  while (!isBusinessDay(current, excludedDates)) {
    current.setDate(current.getDate() + 1);
  }

  // Set to specified hour
  current.setHours(hour, 0, 0, 0);

  return current;
}

/**
 * Calculate days remaining until deadline
 */
export function calculateDaysRemaining(deadline: Date, now = new Date()): number {
  const diffMs = deadline.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Calculate hours remaining until deadline
 */
export function calculateHoursRemaining(deadline: Date, now = new Date()): number {
  const diffMs = deadline.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60));
}
```

---

## Task 3: Create Severity Classification

Create `src/compliance/deadlines/severity.ts`:

```typescript
import { Severity, DeadlineStatus } from '@prisma/client';
import { calculateDaysRemaining } from './calculator';

interface SeverityResult {
  severity: Severity;
  color: string;
  label: string;
  channels: ('push' | 'email' | 'in_app')[];
  escalate: boolean;
}

/**
 * Calculate severity based on days remaining
 */
export function calculateSeverity(
  deadline: Date,
  now = new Date()
): SeverityResult {
  const daysRemaining = calculateDaysRemaining(deadline, now);

  if (daysRemaining < 0) {
    return {
      severity: 'EXPIRED',
      color: '#DC2626', // Red
      label: 'EXPIRED',
      channels: ['push', 'email', 'in_app'],
      escalate: true,
    };
  }

  if (daysRemaining <= 3) {
    return {
      severity: 'CRITICAL',
      color: '#DC2626', // Red
      label: `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left`,
      channels: ['push', 'email', 'in_app'],
      escalate: false,
    };
  }

  if (daysRemaining <= 7) {
    return {
      severity: 'WARNING',
      color: '#F97316', // Orange
      label: `${daysRemaining} days left`,
      channels: ['email', 'in_app'],
      escalate: false,
    };
  }

  if (daysRemaining <= 14) {
    return {
      severity: 'INFO',
      color: '#3B82F6', // Blue
      label: `${daysRemaining} days left`,
      channels: ['in_app'],
      escalate: false,
    };
  }

  return {
    severity: 'LOW',
    color: '#6B7280', // Gray
    label: `${daysRemaining} days left`,
    channels: [],
    escalate: false,
  };
}

/**
 * Get severity display properties
 */
export function getSeverityDisplay(severity: Severity): {
  color: string;
  bgColor: string;
  icon: string;
} {
  switch (severity) {
    case 'EXPIRED':
      return { color: '#DC2626', bgColor: '#FEE2E2', icon: '🚨' };
    case 'CRITICAL':
      return { color: '#DC2626', bgColor: '#FEE2E2', icon: '⚠️' };
    case 'WARNING':
      return { color: '#F97316', bgColor: '#FFEDD5', icon: '⏰' };
    case 'INFO':
      return { color: '#3B82F6', bgColor: '#DBEAFE', icon: 'ℹ️' };
    case 'LOW':
    default:
      return { color: '#6B7280', bgColor: '#F3F4F6', icon: '📋' };
  }
}

/**
 * Determine if a deadline should trigger an alert
 */
export function shouldAlert(
  severity: Severity,
  lastAlertedAt?: Date,
  alertCooldownHours = 24
): boolean {
  // Always alert for EXPIRED
  if (severity === 'EXPIRED') return true;

  // Check cooldown
  if (lastAlertedAt) {
    const hoursSinceLastAlert =
      (Date.now() - lastAlertedAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastAlert < alertCooldownHours) {
      return false;
    }
  }

  // Alert for CRITICAL and WARNING
  return severity === 'CRITICAL' || severity === 'WARNING';
}
```

---

## Task 4: Create Deadline Service

Create `src/compliance/deadlines/service.ts`:

```typescript
import { PrismaClient, DeadlineStatus, TriggerEventType, Severity } from '@prisma/client';
import { calculateDeadline, calculatePromptDeadline, calculateDaysRemaining } from './calculator';
import { calculateSeverity } from './severity';

const prisma = new PrismaClient();

interface CreateDeadlineParams {
  projectId: string;
  clauseId: string;
  triggerEventType: TriggerEventType;
  triggerEventId?: string;
  triggerDescription: string;
  triggeredAt: Date;
  triggeredBy?: string;
}

interface DeadlineWithCountdown {
  id: string;
  clauseRef: string;
  clauseTitle: string;
  kind: string;
  triggerDescription: string;
  triggeredAt: Date;
  calculatedDeadline: Date;
  daysRemaining: number;
  hoursRemaining: number;
  severity: Severity;
  status: DeadlineStatus;
  noticeCreatedAt: Date | null;
}

/**
 * Create a new compliance deadline from a trigger event
 */
export async function createDeadline(
  params: CreateDeadlineParams
): Promise<{ id: string; calculatedDeadline: Date; severity: Severity }> {
  const {
    projectId,
    clauseId,
    triggerEventType,
    triggerEventId,
    triggerDescription,
    triggeredAt,
    triggeredBy,
  } = params;

  // Get the clause
  const clause = await prisma.contractClause.findUnique({
    where: { id: clauseId },
  });

  if (!clause) {
    throw new Error(`Clause not found: ${clauseId}`);
  }

  // Calculate deadline
  let calculatedDeadline: Date;

  // Handle "prompt" deadlines (48 hours / 2 days)
  if (clause.deadlineDays <= 2 && clause.kind === 'CONCEALED_CONDITION') {
    calculatedDeadline = await calculatePromptDeadline(triggeredAt, projectId);
  } else {
    const result = await calculateDeadline({
      triggerDate: triggeredAt,
      deadlineDays: clause.deadlineDays,
      deadlineType: clause.deadlineType,
      curePeriodDays: clause.curePeriodDays || undefined,
      curePeriodType: clause.curePeriodType || undefined,
      projectId,
    });
    calculatedDeadline = result.calculatedDeadline;
  }

  // Calculate initial severity
  const { severity } = calculateSeverity(calculatedDeadline);

  // Create the deadline record
  const deadline = await prisma.complianceDeadline.create({
    data: {
      projectId,
      clauseId,
      triggerEventType,
      triggerEventId,
      triggerDescription,
      triggeredAt,
      triggeredBy,
      calculatedDeadline,
      status: 'ACTIVE',
      severity,
    },
  });

  // Log audit event
  await prisma.complianceAuditLog.create({
    data: {
      projectId,
      eventType: 'DEADLINE_CREATED',
      entityType: 'ComplianceDeadline',
      entityId: deadline.id,
      userId: triggeredBy,
      actorType: triggeredBy ? 'USER' : 'SYSTEM',
      action: 'created',
      details: {
        clauseRef: clause.clauseRef,
        triggerEventType,
        calculatedDeadline: calculatedDeadline.toISOString(),
        severity,
      },
    },
  });

  return {
    id: deadline.id,
    calculatedDeadline,
    severity,
  };
}

/**
 * Get all active deadlines for a project with countdown
 */
export async function getActiveDeadlines(
  projectId: string,
  filters?: {
    status?: DeadlineStatus;
    severity?: Severity;
    sortBy?: 'deadline' | 'severity' | 'daysRemaining';
  }
): Promise<{
  activeCritical: number;
  activeWarning: number;
  totalActive: number;
  deadlines: DeadlineWithCountdown[];
}> {
  const deadlines = await prisma.complianceDeadline.findMany({
    where: {
      projectId,
      ...(filters?.status && { status: filters.status }),
      ...(filters?.severity && { severity: filters.severity }),
    },
    include: {
      clause: {
        select: {
          clauseRef: true,
          clauseTitle: true,
          kind: true,
        },
      },
    },
    orderBy: { calculatedDeadline: 'asc' },
  });

  const now = new Date();

  const withCountdown: DeadlineWithCountdown[] = deadlines.map((d) => ({
    id: d.id,
    clauseRef: d.clause.clauseRef,
    clauseTitle: d.clause.clauseTitle,
    kind: d.clause.kind,
    triggerDescription: d.triggerDescription,
    triggeredAt: d.triggeredAt,
    calculatedDeadline: d.calculatedDeadline,
    daysRemaining: calculateDaysRemaining(d.calculatedDeadline, now),
    hoursRemaining: Math.max(
      0,
      Math.ceil((d.calculatedDeadline.getTime() - now.getTime()) / (1000 * 60 * 60))
    ),
    severity: d.severity,
    status: d.status,
    noticeCreatedAt: d.noticeCreatedAt,
  }));

  // Sort based on filter
  if (filters?.sortBy === 'severity') {
    const severityOrder = { EXPIRED: 0, CRITICAL: 1, WARNING: 2, INFO: 3, LOW: 4 };
    withCountdown.sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
    );
  } else if (filters?.sortBy === 'daysRemaining') {
    withCountdown.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }

  return {
    activeCritical: withCountdown.filter((d) => d.severity === 'CRITICAL').length,
    activeWarning: withCountdown.filter((d) => d.severity === 'WARNING').length,
    totalActive: withCountdown.filter((d) => d.status === 'ACTIVE').length,
    deadlines: withCountdown,
  };
}

/**
 * Update deadline severities (run daily via cron)
 */
export async function updateDeadlineSeverities(): Promise<{
  updated: number;
  expired: number;
}> {
  const activeDeadlines = await prisma.complianceDeadline.findMany({
    where: {
      status: 'ACTIVE',
    },
    include: {
      clause: true,
    },
  });

  let updated = 0;
  let expired = 0;

  for (const deadline of activeDeadlines) {
    const { severity } = calculateSeverity(deadline.calculatedDeadline);

    if (severity !== deadline.severity) {
      await prisma.complianceDeadline.update({
        where: { id: deadline.id },
        data: { severity },
      });
      updated++;
    }

    // Check for expiration
    if (severity === 'EXPIRED' && deadline.status === 'ACTIVE') {
      await handleExpiredDeadline(deadline.id);
      expired++;
    }
  }

  return { updated, expired };
}

/**
 * Handle an expired deadline
 */
export async function handleExpiredDeadline(deadlineId: string): Promise<void> {
  const deadline = await prisma.complianceDeadline.findUnique({
    where: { id: deadlineId },
    include: { clause: true },
  });

  if (!deadline) return;

  // Update status
  await prisma.complianceDeadline.update({
    where: { id: deadlineId },
    data: {
      status: 'EXPIRED',
      severity: 'EXPIRED',
    },
  });

  // Log audit event
  await prisma.complianceAuditLog.create({
    data: {
      projectId: deadline.projectId,
      eventType: 'DEADLINE_EXPIRED',
      entityType: 'ComplianceDeadline',
      entityId: deadlineId,
      actorType: 'SYSTEM',
      action: 'expired',
      details: {
        clauseRef: deadline.clause.clauseRef,
        calculatedDeadline: deadline.calculatedDeadline.toISOString(),
        potentialConsequence: 'Claim forfeiture risk',
      },
    },
  });

  // Recalculate compliance score
  await recalculateProjectScore(deadline.projectId);

  // TODO: Send escalation notification (Phase 5)
}

/**
 * Waive a deadline
 */
export async function waiveDeadline(
  deadlineId: string,
  userId: string,
  reason: string
): Promise<void> {
  const deadline = await prisma.complianceDeadline.update({
    where: { id: deadlineId },
    data: {
      status: 'WAIVED',
      waivedAt: new Date(),
      waivedBy: userId,
      waiverReason: reason,
    },
    include: { clause: true },
  });

  await prisma.complianceAuditLog.create({
    data: {
      projectId: deadline.projectId,
      eventType: 'DEADLINE_WAIVED',
      entityType: 'ComplianceDeadline',
      entityId: deadlineId,
      userId,
      actorType: 'USER',
      action: 'waived',
      details: { reason },
    },
  });
}

/**
 * Placeholder for score recalculation (implemented in Phase 5)
 */
async function recalculateProjectScore(projectId: string): Promise<void> {
  // Will be implemented in Phase 5
  console.log(`Recalculating compliance score for project ${projectId}`);
}
```

---

## Task 5: Create API Endpoints

Create `src/compliance/api/deadlines.ts`:

```typescript
import { Router, Request, Response } from 'express';
import {
  createDeadline,
  getActiveDeadlines,
  waiveDeadline,
} from '../deadlines/service';
import { TriggerEventType } from '@prisma/client';

const router = Router();

/**
 * GET /api/projects/:projectId/compliance/deadlines
 * Get all active deadlines with countdown
 */
router.get(
  '/projects/:projectId/compliance/deadlines',
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { status, severity, sortBy } = req.query;

      const result = await getActiveDeadlines(projectId, {
        status: status as any,
        severity: severity as any,
        sortBy: sortBy as any,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error fetching deadlines:', error);
      res.status(500).json({ error: 'Failed to fetch deadlines' });
    }
  }
);

/**
 * POST /api/projects/:projectId/compliance/deadlines
 * Create a new deadline from trigger event
 */
router.post(
  '/projects/:projectId/compliance/deadlines',
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const userId = req.user?.id;
      const {
        clauseId,
        triggerEventType,
        triggerEventId,
        triggerDescription,
        triggeredAt,
      } = req.body;

      const result = await createDeadline({
        projectId,
        clauseId,
        triggerEventType: triggerEventType as TriggerEventType,
        triggerEventId,
        triggerDescription,
        triggeredAt: new Date(triggeredAt),
        triggeredBy: userId,
      });

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error creating deadline:', error);
      res.status(500).json({ error: 'Failed to create deadline' });
    }
  }
);

/**
 * POST /api/projects/:projectId/compliance/deadlines/:deadlineId/waive
 * Waive a deadline
 */
router.post(
  '/projects/:projectId/compliance/deadlines/:deadlineId/waive',
  async (req: Request, res: Response) => {
    try {
      const { deadlineId } = req.params;
      const userId = req.user?.id;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({ error: 'Waiver reason is required' });
      }

      await waiveDeadline(deadlineId, userId, reason);

      res.json({ success: true });
    } catch (error) {
      console.error('Error waiving deadline:', error);
      res.status(500).json({ error: 'Failed to waive deadline' });
    }
  }
);

export default router;
```

---

## Task 6: Create Scheduled Job for Severity Updates

Create `src/compliance/deadlines/cron.ts`:

```typescript
import cron from 'node-cron';
import { updateDeadlineSeverities } from './service';

/**
 * Schedule daily severity updates
 * Runs at 12:01 AM in project timezone
 */
export function scheduleDeadlineChecks(): void {
  // Run every hour to check severity changes
  cron.schedule('0 * * * *', async () => {
    console.log('Running hourly deadline severity check...');
    try {
      const result = await updateDeadlineSeverities();
      console.log(`Severity check complete: ${result.updated} updated, ${result.expired} expired`);
    } catch (error) {
      console.error('Error in severity check:', error);
    }
  });

  // Run at 9 AM to send daily summary (implemented in Phase 5)
  cron.schedule('0 9 * * *', async () => {
    console.log('Sending daily deadline summary...');
    // TODO: Implement in Phase 5
  });

  console.log('Deadline check jobs scheduled');
}
```

---

## Task 7: Unit Tests

Create `src/compliance/deadlines/__tests__/calculator.test.ts`:

```typescript
import { addCalendarDays, calculateDaysRemaining } from '../calculator';
import { calculateSeverity } from '../severity';

describe('Calendar Days Calculation', () => {
  it('should add 21 calendar days including weekends and holidays', () => {
    // Feb 1, 2025 (Saturday)
    const triggerDate = new Date('2025-02-01T09:00:00Z');
    const result = addCalendarDays(triggerDate, 21);

    // Should be Feb 22, 2025
    expect(result.getDate()).toBe(22);
    expect(result.getMonth()).toBe(1); // February (0-indexed)
    expect(result.getFullYear()).toBe(2025);
  });

  it('should handle month boundaries', () => {
    const triggerDate = new Date('2025-01-25T09:00:00Z');
    const result = addCalendarDays(triggerDate, 14);

    // Should be Feb 8, 2025
    expect(result.getDate()).toBe(8);
    expect(result.getMonth()).toBe(1); // February
  });
});

describe('Days Remaining Calculation', () => {
  it('should calculate positive days remaining', () => {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 5);
    const result = calculateDaysRemaining(deadline);
    expect(result).toBe(5);
  });

  it('should calculate negative days for expired deadlines', () => {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() - 3);
    const result = calculateDaysRemaining(deadline);
    expect(result).toBe(-3);
  });
});

describe('Severity Classification', () => {
  it('should return CRITICAL for <= 3 days', () => {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 2);
    const result = calculateSeverity(deadline);
    expect(result.severity).toBe('CRITICAL');
  });

  it('should return WARNING for 3-7 days', () => {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 5);
    const result = calculateSeverity(deadline);
    expect(result.severity).toBe('WARNING');
  });

  it('should return INFO for 7-14 days', () => {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 10);
    const result = calculateSeverity(deadline);
    expect(result.severity).toBe('INFO');
  });

  it('should return LOW for > 14 days', () => {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 20);
    const result = calculateSeverity(deadline);
    expect(result.severity).toBe('LOW');
  });

  it('should return EXPIRED for past deadlines', () => {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() - 1);
    const result = calculateSeverity(deadline);
    expect(result.severity).toBe('EXPIRED');
    expect(result.escalate).toBe(true);
  });
});
```

---

## Verification Checklist

- [ ] Holiday configuration includes 2025, 2026, 2027 federal holidays
- [ ] Project holidays can be added and retrieved
- [ ] Calendar day calculation works correctly
- [ ] Business day calculation excludes weekends and holidays
- [ ] "Prompt" (48-hour) deadline calculation works
- [ ] Cure period handling works correctly
- [ ] Severity classification matches spec (CRITICAL <= 3, WARNING 3-7, etc.)
- [ ] Deadline creation triggers audit log
- [ ] Expired deadline handling updates status and logs
- [ ] Deadline waiver workflow works
- [ ] Cron job for severity updates scheduled
- [ ] API endpoints return proper response format
- [ ] Unit tests pass

---

## Next Phase

Once deadline calculation is complete, proceed to **PHASE4_NOTICES.md** for notice generation and delivery.
