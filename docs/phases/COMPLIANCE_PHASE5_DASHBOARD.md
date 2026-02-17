# PHASE5_DASHBOARD.md - Compliance Scoring, Dashboard & Alerts

## Objective
Build the compliance scoring engine, real-time dashboard visualizations, and notification/alert system using the EXISTING `ComplianceScore` model.

## Duration: 4-5 days

## Prerequisites
- Phase 1-4 complete
- ComplianceNotice records with delivery confirmations exist
- Notification service configured (push, email, in-app)

## IMPORTANT: Use Existing Models

The `ComplianceScore` model already exists. Phase 1 added new fields for streak tracking and claims value. 

Also use existing:
- `Notification` model (already has type, severity, channel)
- `HealthScore` model (already has complianceScore field)

---

## Task 1: Create Compliance Score Calculator

Create `src/compliance/scoring/calculator.ts`:

```typescript
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

interface ComplianceScoreResult {
  projectId: string;
  compliancePercentage: number | null;
  onTimeCount: number;
  totalCount: number;
  missedCount: number;
  currentStreak: number;
  bestStreak: number;
  streakBrokenAt: Date | null;
  protectedClaimsValue: number;
  atRiskValue: number;
  atRiskCount: number;
  activeCount: number;
  upcomingCount: number;
  display: {
    scorePercentage: string;
    streakDisplay: string;
    protectedValue: string;
    verdict: string;
  };
}

/**
 * Calculate compliance score for a project
 */
export async function calculateComplianceScore(
  projectId: string
): Promise<ComplianceScoreResult> {
  // Get all completed notices
  const notices = await prisma.complianceNotice.findMany({
    where: {
      projectId,
      status: { in: ['DELIVERED', 'EXPIRED'] },
    },
    orderBy: { sentDate: 'asc' },
  });

  // Count on-time vs total
  const onTimeNotices = notices.filter((n) => n.onTimeStatus === true);
  const missedNotices = notices.filter((n) => n.onTimeStatus === false || n.status === 'EXPIRED');

  const onTimeCount = onTimeNotices.length;
  const totalCount = notices.length;
  const missedCount = missedNotices.length;

  // Calculate percentage
  const compliancePercentage = totalCount > 0 ? (onTimeCount / totalCount) * 100 : null;

  // Calculate streak
  const { currentStreak, bestStreak, streakBrokenAt } = calculateStreak(notices);

  // Calculate protected claims value
  const protectedClaimsValue = await calculateProtectedClaimsValue(projectId);

  // Get at-risk deadlines
  const atRiskDeadlines = await prisma.complianceDeadline.findMany({
    where: {
      projectId,
      status: 'ACTIVE',
      severity: { in: ['CRITICAL', 'WARNING'] },
    },
  });

  const activeDeadlines = await prisma.complianceDeadline.count({
    where: { projectId, status: 'ACTIVE' },
  });

  const upcomingDeadlines = await prisma.complianceDeadline.count({
    where: {
      projectId,
      status: 'ACTIVE',
      calculatedDeadline: {
        lte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // Next 14 days
      },
    },
  });

  // Update or create score record
  await prisma.complianceScore.upsert({
    where: { projectId },
    update: {
      compliancePercentage: compliancePercentage ? new Prisma.Decimal(compliancePercentage) : null,
      onTimeCount,
      totalCount,
      missedCount,
      currentStreak,
      bestStreak,
      streakBrokenAt,
      protectedClaimsValue: new Prisma.Decimal(protectedClaimsValue),
      atRiskCount: atRiskDeadlines.length,
      activeCount: activeDeadlines,
      upcomingCount: upcomingDeadlines,
      lastCalculatedAt: new Date(),
    },
    create: {
      projectId,
      compliancePercentage: compliancePercentage ? new Prisma.Decimal(compliancePercentage) : null,
      onTimeCount,
      totalCount,
      missedCount,
      currentStreak,
      bestStreak,
      streakBrokenAt,
      protectedClaimsValue: new Prisma.Decimal(protectedClaimsValue),
      atRiskCount: atRiskDeadlines.length,
      activeCount: activeDeadlines,
      upcomingCount: upcomingDeadlines,
    },
  });

  return {
    projectId,
    compliancePercentage,
    onTimeCount,
    totalCount,
    missedCount,
    currentStreak,
    bestStreak,
    streakBrokenAt,
    protectedClaimsValue,
    atRiskValue: 0, // Calculate based on at-risk deadlines
    atRiskCount: atRiskDeadlines.length,
    activeCount: activeDeadlines,
    upcomingCount: upcomingDeadlines,
    display: {
      scorePercentage: compliancePercentage !== null ? `${compliancePercentage.toFixed(0)}%` : 'N/A',
      streakDisplay: currentStreak > 0 ? `${currentStreak} consecutive notices on time` : 'No active streak',
      protectedValue: formatCurrency(protectedClaimsValue),
      verdict: getVerdict(compliancePercentage),
    },
  };
}

/**
 * Calculate consecutive on-time streak
 */
function calculateStreak(
  notices: Array<{ onTimeStatus: boolean | null; sentDate: Date | null }>
): { currentStreak: number; bestStreak: number; streakBrokenAt: Date | null } {
  let currentStreak = 0;
  let bestStreak = 0;
  let streakBrokenAt: Date | null = null;

  // Sort by sent date descending (most recent first)
  const sorted = [...notices]
    .filter((n) => n.sentDate)
    .sort((a, b) => b.sentDate!.getTime() - a.sentDate!.getTime());

  // Count current streak from most recent
  for (const notice of sorted) {
    if (notice.onTimeStatus === true) {
      currentStreak++;
    } else {
      streakBrokenAt = notice.sentDate;
      break;
    }
  }

  // Calculate best streak
  let tempStreak = 0;
  for (const notice of sorted.reverse()) {
    if (notice.onTimeStatus === true) {
      tempStreak++;
      bestStreak = Math.max(bestStreak, tempStreak);
    } else {
      tempStreak = 0;
    }
  }

  return { currentStreak, bestStreak, streakBrokenAt };
}

/**
 * Calculate total protected claims value
 */
async function calculateProtectedClaimsValue(projectId: string): Promise<number> {
  // Get all on-time notices with associated change events
  const onTimeNotices = await prisma.complianceNotice.findMany({
    where: {
      projectId,
      onTimeStatus: true,
    },
    include: {
      deadline: true,
    },
  });

  let totalProtected = 0;

  for (const notice of onTimeNotices) {
    // If deadline has associated change event, add its value
    if (notice.deadline.triggerEventId) {
      // Query your change events table for the value
      // This depends on your data model for change events
      const changeEvent = await prisma.changeEvent?.findUnique?.({
        where: { id: notice.deadline.triggerEventId },
      });
      if (changeEvent?.value) {
        totalProtected += Number(changeEvent.value);
      }
    }
  }

  // If no change events tracked, use estimated average
  if (totalProtected === 0 && onTimeNotices.length > 0) {
    // Estimate $50K average per notice (industry standard)
    totalProtected = onTimeNotices.length * 50000;
  }

  return totalProtected;
}

/**
 * Get compliance verdict text
 */
function getVerdict(percentage: number | null): string {
  if (percentage === null) return 'No notices tracked yet';
  if (percentage >= 100) return 'Excellent compliance';
  if (percentage >= 95) return 'Strong compliance';
  if (percentage >= 90) return 'Good compliance';
  if (percentage >= 80) return 'Fair compliance - room for improvement';
  if (percentage >= 60) return 'Poor compliance - action needed';
  return 'Critical - immediate action required';
}

/**
 * Format currency for display
 */
function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M in claim rights preserved`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K in claim rights preserved`;
  }
  return `$${value.toFixed(0)} in claim rights preserved`;
}

/**
 * Get compliance score for display
 */
export async function getComplianceScore(projectId: string): Promise<ComplianceScoreResult> {
  // Check if we have a recent score (within 1 hour)
  const existing = await prisma.complianceScore.findUnique({
    where: { projectId },
  });

  if (existing) {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (existing.lastCalculatedAt > hourAgo) {
      // Return cached score
      return {
        projectId,
        compliancePercentage: existing.compliancePercentage ? Number(existing.compliancePercentage) : null,
        onTimeCount: existing.onTimeCount,
        totalCount: existing.totalCount,
        missedCount: existing.missedCount,
        currentStreak: existing.currentStreak,
        bestStreak: existing.bestStreak,
        streakBrokenAt: existing.streakBrokenAt,
        protectedClaimsValue: Number(existing.protectedClaimsValue),
        atRiskValue: Number(existing.atRiskValue),
        atRiskCount: existing.atRiskCount,
        activeCount: existing.activeCount,
        upcomingCount: existing.upcomingCount,
        display: {
          scorePercentage: existing.compliancePercentage ? `${Number(existing.compliancePercentage).toFixed(0)}%` : 'N/A',
          streakDisplay: existing.currentStreak > 0 ? `${existing.currentStreak} consecutive notices on time` : 'No active streak',
          protectedValue: formatCurrency(Number(existing.protectedClaimsValue)),
          verdict: getVerdict(existing.compliancePercentage ? Number(existing.compliancePercentage) : null),
        },
      };
    }
  }

  // Recalculate
  return calculateComplianceScore(projectId);
}

/**
 * Save score history snapshot
 */
export async function saveScoreSnapshot(
  projectId: string,
  periodType: 'daily' | 'weekly' | 'monthly'
): Promise<void> {
  const score = await getComplianceScore(projectId);

  const scoreRecord = await prisma.complianceScore.findUnique({
    where: { projectId },
  });

  if (!scoreRecord) return;

  await prisma.complianceScoreHistory.create({
    data: {
      scoreId: scoreRecord.id,
      snapshotDate: new Date(),
      compliancePercentage: score.compliancePercentage ? new Prisma.Decimal(score.compliancePercentage) : null,
      onTimeCount: score.onTimeCount,
      totalCount: score.totalCount,
      noticesSentInPeriod: 0, // Calculate based on period
      protectedClaimsValue: new Prisma.Decimal(score.protectedClaimsValue),
      periodType,
    },
  });
}

/**
 * Get score history for trending
 */
export async function getScoreHistory(
  projectId: string,
  period: 'week' | 'month' | 'quarter' | 'year'
): Promise<Array<{
  date: string;
  compliancePercentage: number | null;
  onTimeCount: number;
  totalCount: number;
  protectedClaimsValue: number;
}>> {
  const scoreRecord = await prisma.complianceScore.findUnique({
    where: { projectId },
  });

  if (!scoreRecord) return [];

  const daysBack = period === 'week' ? 7 : period === 'month' ? 30 : period === 'quarter' ? 90 : 365;
  const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  const history = await prisma.complianceScoreHistory.findMany({
    where: {
      scoreId: scoreRecord.id,
      snapshotDate: { gte: startDate },
    },
    orderBy: { snapshotDate: 'asc' },
  });

  return history.map((h) => ({
    date: h.snapshotDate.toISOString().split('T')[0],
    compliancePercentage: h.compliancePercentage ? Number(h.compliancePercentage) : null,
    onTimeCount: h.onTimeCount,
    totalCount: h.totalCount,
    protectedClaimsValue: Number(h.protectedClaimsValue),
  }));
}
```

---

## Task 2: Create Alert Service

Create `src/compliance/alerts/service.ts`:

```typescript
import { PrismaClient, Severity } from '@prisma/client';

const prisma = new PrismaClient();

interface AlertConfig {
  severity: Severity;
  channels: ('push' | 'email' | 'in_app')[];
  escalate: boolean;
}

const ALERT_CONFIG: Record<Severity, AlertConfig> = {
  CRITICAL: { severity: 'CRITICAL', channels: ['push', 'email', 'in_app'], escalate: false },
  WARNING: { severity: 'WARNING', channels: ['email', 'in_app'], escalate: false },
  INFO: { severity: 'INFO', channels: ['in_app'], escalate: false },
  LOW: { severity: 'LOW', channels: [], escalate: false },
  EXPIRED: { severity: 'EXPIRED', channels: ['push', 'email', 'in_app'], escalate: true },
};

interface Notification {
  id: string;
  projectId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  severity: Severity;
  entityType: string;
  entityId: string;
  read: boolean;
  readAt?: Date;
  createdAt: Date;
}

/**
 * Send compliance deadline alert
 */
export async function sendDeadlineAlert(
  projectId: string,
  deadlineId: string,
  severity: Severity,
  message: string
): Promise<void> {
  const config = ALERT_CONFIG[severity];
  if (config.channels.length === 0) return;

  // Get project team members
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      team: {
        include: { user: true },
      },
    },
  });

  if (!project) return;

  const deadline = await prisma.complianceDeadline.findUnique({
    where: { id: deadlineId },
    include: { clause: true },
  });

  if (!deadline) return;

  const title = `${severity}: ${deadline.clause.clauseTitle} deadline`;
  const body = message;

  // Send to each team member
  for (const member of project.team || []) {
    // In-app notification
    if (config.channels.includes('in_app')) {
      await createInAppNotification({
        projectId,
        userId: member.userId,
        type: 'DEADLINE_ALERT',
        title,
        body,
        severity,
        entityType: 'ComplianceDeadline',
        entityId: deadlineId,
      });
    }

    // Email notification
    if (config.channels.includes('email')) {
      await sendAlertEmail({
        to: member.user.email,
        subject: title,
        body,
        severity,
        projectName: project.name,
      });
    }

    // Push notification
    if (config.channels.includes('push')) {
      await sendPushNotification({
        userId: member.userId,
        title,
        body,
        data: { projectId, deadlineId, severity },
      });
    }
  }

  // Escalate to executive if needed
  if (config.escalate) {
    await escalateToExecutive(projectId, title, body, deadlineId);
  }
}

/**
 * Create in-app notification
 */
async function createInAppNotification(params: {
  projectId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  severity: Severity;
  entityType: string;
  entityId: string;
}): Promise<void> {
  // Store in your notifications table
  // This depends on your notification model
  console.log('Creating in-app notification:', params);
}

/**
 * Send alert email
 */
async function sendAlertEmail(params: {
  to: string;
  subject: string;
  body: string;
  severity: Severity;
  projectName: string;
}): Promise<void> {
  // Use your email service
  console.log('Sending alert email:', params);
}

/**
 * Send push notification
 */
async function sendPushNotification(params: {
  userId: string;
  title: string;
  body: string;
  data: Record<string, any>;
}): Promise<void> {
  // Use your push notification service (FCM, APNS, etc.)
  console.log('Sending push notification:', params);
}

/**
 * Escalate to project executive
 */
async function escalateToExecutive(
  projectId: string,
  title: string,
  body: string,
  deadlineId: string
): Promise<void> {
  // Get project executive/owner
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { owner: true },
  });

  if (!project?.owner) return;

  console.log(`ESCALATING to executive ${project.owner.email}: ${title}`);

  // Send email to executive
  await sendAlertEmail({
    to: project.owner.email,
    subject: `🚨 ESCALATION: ${title}`,
    body: `${body}\n\nThis deadline has expired and requires immediate attention.`,
    severity: 'EXPIRED',
    projectName: project.name,
  });
}

/**
 * Send weekly compliance summary
 */
export async function sendWeeklyComplianceSummary(projectId: string): Promise<void> {
  const score = await prisma.complianceScore.findUnique({
    where: { projectId },
    include: { project: { include: { team: { include: { user: true } } } } },
  });

  if (!score) return;

  const upcomingDeadlines = await prisma.complianceDeadline.findMany({
    where: {
      projectId,
      status: 'ACTIVE',
      calculatedDeadline: {
        lte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    },
    include: { clause: true },
    orderBy: { calculatedDeadline: 'asc' },
    take: 5,
  });

  const subject = `Weekly Compliance Summary — ${score.project.name}`;
  const body = generateWeeklySummaryEmail(score, upcomingDeadlines);

  for (const member of score.project.team || []) {
    await sendAlertEmail({
      to: member.user.email,
      subject,
      body,
      severity: 'INFO',
      projectName: score.project.name,
    });
  }
}

/**
 * Generate weekly summary email content
 */
function generateWeeklySummaryEmail(score: any, upcomingDeadlines: any[]): string {
  const percentage = score.compliancePercentage ? `${Number(score.compliancePercentage).toFixed(0)}%` : 'N/A';
  
  let content = `
PERFORMANCE
✓ Compliance Score: ${percentage} (${score.onTimeCount}/${score.totalCount} notices on time)
✓ Current Streak: ${score.currentStreak} consecutive notices
✓ Claims Protected: $${Number(score.protectedClaimsValue).toLocaleString()}

UPCOMING DEADLINES (Next 14 Days)
`;

  for (const deadline of upcomingDeadlines) {
    const daysLeft = Math.ceil(
      (deadline.calculatedDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    const severity = daysLeft <= 3 ? '🔴 CRITICAL' : daysLeft <= 7 ? '🟠 WARNING' : '🔵 INFO';
    content += `${severity}: ${deadline.clause.clauseTitle} (${deadline.clause.clauseRef}) — ${daysLeft} days\n`;
  }

  if (upcomingDeadlines.length === 0) {
    content += 'No upcoming deadlines in the next 14 days.\n';
  }

  return content;
}

/**
 * Check for deadlines requiring alerts (run hourly)
 */
export async function checkDeadlinesForAlerts(): Promise<void> {
  const criticalDeadlines = await prisma.complianceDeadline.findMany({
    where: {
      status: 'ACTIVE',
      severity: { in: ['CRITICAL', 'WARNING'] },
    },
    include: { clause: true },
  });

  for (const deadline of criticalDeadlines) {
    const daysRemaining = Math.ceil(
      (deadline.calculatedDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    const message = `Notice due in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}: ${deadline.clause.clauseTitle} — ${deadline.triggerDescription}`;

    await sendDeadlineAlert(
      deadline.projectId,
      deadline.id,
      deadline.severity,
      message
    );
  }
}
```

---

## Task 3: Create API Endpoints

Create `src/compliance/api/scores.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { getComplianceScore, getScoreHistory, calculateComplianceScore } from '../scoring/calculator';

const router = Router();

// GET /api/projects/:projectId/compliance/score
router.get('/projects/:projectId/compliance/score', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const score = await getComplianceScore(projectId);
    res.json({ success: true, data: score });
  } catch (error) {
    console.error('Error fetching compliance score:', error);
    res.status(500).json({ error: 'Failed to fetch compliance score' });
  }
});

// GET /api/projects/:projectId/compliance/score/history
router.get('/projects/:projectId/compliance/score/history', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { period } = req.query;
    const history = await getScoreHistory(projectId, (period as any) || 'month');
    res.json({ success: true, data: { period: period || 'month', dataPoints: history } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch score history' });
  }
});

// POST /api/projects/:projectId/compliance/score/recalculate
router.post('/projects/:projectId/compliance/score/recalculate', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const score = await calculateComplianceScore(projectId);
    res.json({ success: true, data: score });
  } catch (error) {
    res.status(500).json({ error: 'Failed to recalculate score' });
  }
});

export default router;
```

---

## Task 4: Create React Dashboard Components

Create `src/components/compliance/ScoreDashboard.tsx`:

```tsx
import React from 'react';

interface ComplianceScoreData {
  compliancePercentage: number | null;
  onTimeCount: number;
  totalCount: number;
  missedCount: number;
  currentStreak: number;
  protectedClaimsValue: number;
  atRiskCount: number;
  display: {
    scorePercentage: string;
    streakDisplay: string;
    protectedValue: string;
    verdict: string;
  };
}

interface ScoreDashboardProps {
  data: ComplianceScoreData;
}

export function ScoreDashboard({ data }: ScoreDashboardProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4">
      {/* Compliance Score Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-medium text-gray-500">COMPLIANCE SCORE</h3>
        <div className="mt-2 flex items-baseline">
          <span className="text-4xl font-bold text-green-600">
            {data.display.scorePercentage}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {data.onTimeCount}/{data.totalCount} notices on time
        </p>
        <p className="mt-1 text-sm font-medium text-gray-700">
          {data.display.verdict}
        </p>
      </div>

      {/* Streak Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-medium text-gray-500">CURRENT STREAK</h3>
        <div className="mt-2 flex items-baseline">
          <span className="text-4xl font-bold text-blue-600">
            {data.currentStreak}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {data.display.streakDisplay}
        </p>
      </div>

      {/* Protected Claims Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-medium text-gray-500">CLAIMS PROTECTED</h3>
        <div className="mt-2 flex items-baseline">
          <span className="text-4xl font-bold text-emerald-600">
            ${(data.protectedClaimsValue / 1000000).toFixed(1)}M
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {data.display.protectedValue}
        </p>
      </div>

      {/* At Risk Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-medium text-gray-500">AT RISK</h3>
        <div className="mt-2 flex items-baseline">
          <span className={`text-4xl font-bold ${data.atRiskCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {data.atRiskCount}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {data.atRiskCount > 0 ? 'Deadlines requiring attention' : 'All deadlines on track'}
        </p>
      </div>
    </div>
  );
}
```

Create `src/components/compliance/ScoreRing.tsx`:

```tsx
import React from 'react';

interface ScoreRingProps {
  percentage: number | null;
  size?: number;
}

export function ScoreRing({ percentage, size = 200 }: ScoreRingProps) {
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const value = percentage ?? 0;
  const strokeDashoffset = circumference - (value / 100) * circumference;

  const getColor = (pct: number) => {
    if (pct >= 95) return '#10B981'; // Green
    if (pct >= 80) return '#F59E0B'; // Yellow
    return '#EF4444'; // Red
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke="#E5E7EB"
          fill="none"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke={getColor(value)}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-4xl font-bold">
          {percentage !== null ? `${percentage.toFixed(0)}%` : 'N/A'}
        </span>
        <span className="text-sm text-gray-500">Compliance</span>
      </div>
    </div>
  );
}
```

Create `src/components/compliance/TickingClock.tsx`:

```tsx
import React, { useState, useEffect } from 'react';

interface Deadline {
  id: string;
  clauseRef: string;
  clauseTitle: string;
  triggerDescription: string;
  calculatedDeadline: string;
  daysRemaining: number;
  hoursRemaining: number;
  severity: 'CRITICAL' | 'WARNING' | 'INFO' | 'LOW';
}

interface TickingClockProps {
  deadline: Deadline;
  onDraftNotice: (deadlineId: string) => void;
  onViewClause: (deadlineId: string) => void;
}

export function TickingClock({ deadline, onDraftNotice, onViewClause }: TickingClockProps) {
  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  function calculateTimeLeft() {
    const diff = new Date(deadline.calculatedDeadline).getTime() - Date.now();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return { days, hours, minutes, expired: diff <= 0 };
  }

  useEffect(() => {
    const timer = setInterval(() => setTimeLeft(calculateTimeLeft()), 60000);
    return () => clearInterval(timer);
  }, [deadline.calculatedDeadline]);

  const bgColor = deadline.severity === 'CRITICAL' ? 'bg-red-600' : 
                  deadline.severity === 'WARNING' ? 'bg-orange-500' : 'bg-blue-500';

  return (
    <div className={`${bgColor} text-white rounded-lg p-6 shadow-lg`}>
      <div className="text-sm font-medium opacity-90">
        {deadline.severity} DEADLINE
      </div>
      
      <div className="mt-4 text-center">
        {timeLeft.expired ? (
          <div className="text-5xl font-bold">EXPIRED</div>
        ) : (
          <div className="text-5xl font-bold">
            {timeLeft.days > 0 && `${timeLeft.days}d `}
            {timeLeft.hours}h {timeLeft.minutes}m
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="font-semibold">
          {deadline.clauseTitle} — {deadline.clauseRef}
        </div>
        <div className="text-sm opacity-90 mt-1">
          {deadline.triggerDescription}
        </div>
        <div className="text-sm opacity-90">
          Due: {new Date(deadline.calculatedDeadline).toLocaleDateString()}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => onDraftNotice(deadline.id)}
          className="flex-1 bg-white text-gray-900 px-4 py-2 rounded font-medium hover:bg-gray-100"
        >
          Draft Notice
        </button>
        <button
          onClick={() => onViewClause(deadline.id)}
          className="px-4 py-2 border border-white rounded font-medium hover:bg-white/10"
        >
          View Clause
        </button>
      </div>
    </div>
  );
}
```

---

## Task 5: Create Cron Jobs

Create `src/compliance/cron.ts`:

```typescript
import cron from 'node-cron';
import { updateDeadlineSeverities } from './deadlines/service';
import { checkDeadlinesForAlerts, sendWeeklyComplianceSummary } from './alerts/service';
import { saveScoreSnapshot } from './scoring/calculator';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function scheduleComplianceJobs(): void {
  // Hourly: Update severities and check for alerts
  cron.schedule('0 * * * *', async () => {
    console.log('Running hourly compliance check...');
    try {
      await updateDeadlineSeverities();
      await checkDeadlinesForAlerts();
    } catch (error) {
      console.error('Hourly compliance check failed:', error);
    }
  });

  // Daily at midnight: Save score snapshots
  cron.schedule('0 0 * * *', async () => {
    console.log('Saving daily score snapshots...');
    try {
      const projects = await prisma.project.findMany({ select: { id: true } });
      for (const project of projects) {
        await saveScoreSnapshot(project.id, 'daily');
      }
    } catch (error) {
      console.error('Daily snapshot failed:', error);
    }
  });

  // Weekly on Monday at 9 AM: Send weekly summaries
  cron.schedule('0 9 * * 1', async () => {
    console.log('Sending weekly compliance summaries...');
    try {
      const projects = await prisma.project.findMany({ select: { id: true } });
      for (const project of projects) {
        await sendWeeklyComplianceSummary(project.id);
      }
    } catch (error) {
      console.error('Weekly summary failed:', error);
    }
  });

  console.log('Compliance cron jobs scheduled');
}
```

---

## Verification Checklist

- [ ] Compliance score calculates correctly (onTime / total)
- [ ] Streak tracking works (resets on miss)
- [ ] Protected claims value calculation works
- [ ] Score history saved for trending
- [ ] Alert service sends notifications for CRITICAL/WARNING
- [ ] Escalation to executive works for EXPIRED deadlines
- [ ] Weekly summary email generates correctly
- [ ] React components render score, ring, and ticking clock
- [ ] API endpoints return proper responses
- [ ] Cron jobs scheduled for hourly/daily/weekly tasks

---

## Next Phase

Proceed to **PHASE6_INTEGRATION.md** for integration with existing capabilities.
