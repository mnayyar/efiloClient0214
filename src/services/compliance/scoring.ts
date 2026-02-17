import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────

export interface ComplianceScoreResult {
  projectId: string;
  score: number; // 0-100
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

// ── Score Calculator ──────────────────────────────────────────────────────

export async function calculateComplianceScore(
  projectId: string
): Promise<ComplianceScoreResult> {
  // Get all notices with delivery status
  const notices = await prisma.complianceNotice.findMany({
    where: {
      projectId,
      status: { in: ["SENT", "ACKNOWLEDGED", "EXPIRED"] },
    },
    orderBy: { sentAt: "asc" },
  });

  // Count on-time vs late vs expired
  const onTimeNotices = notices.filter((n) => n.onTimeStatus === true);
  const missedNotices = notices.filter(
    (n) => n.onTimeStatus === false || n.status === "EXPIRED"
  );

  const onTimeCount = onTimeNotices.length;
  const totalCount = notices.length;
  const missedCount = missedNotices.length;

  const compliancePercentage =
    totalCount > 0 ? (onTimeCount / totalCount) * 100 : null;
  const score =
    compliancePercentage !== null ? Math.round(compliancePercentage) : 100;

  // Calculate streak
  const { currentStreak, bestStreak, streakBrokenAt } =
    calculateStreak(notices);

  // Calculate protected claims value
  const protectedClaimsValue =
    await calculateProtectedClaimsValue(projectId);

  // Get at-risk deadlines (CRITICAL or WARNING severity)
  const atRiskCount = await prisma.complianceDeadline.count({
    where: {
      projectId,
      status: "ACTIVE",
      severity: { in: ["CRITICAL", "WARNING"] },
    },
  });

  // Get active deadlines
  const activeCount = await prisma.complianceDeadline.count({
    where: { projectId, status: "ACTIVE" },
  });

  // Get upcoming deadlines (next 14 days)
  const upcomingCount = await prisma.complianceDeadline.count({
    where: {
      projectId,
      status: "ACTIVE",
      calculatedDeadline: {
        lte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    },
  });

  // Estimate at-risk value from change events linked to at-risk deadlines
  const atRiskDeadlines = await prisma.complianceDeadline.findMany({
    where: {
      projectId,
      status: "ACTIVE",
      severity: { in: ["CRITICAL", "WARNING", "EXPIRED"] },
      triggerEventId: { not: null },
    },
    select: { triggerEventId: true },
  });

  let atRiskValue = 0;
  if (atRiskDeadlines.length > 0) {
    const eventIds = atRiskDeadlines
      .map((d) => d.triggerEventId)
      .filter(Boolean) as string[];
    if (eventIds.length > 0) {
      const events = await prisma.changeEvent.findMany({
        where: { id: { in: eventIds } },
        select: { estimatedValue: true },
      });
      atRiskValue = events.reduce(
        (sum, e) => sum + (e.estimatedValue ? Number(e.estimatedValue) : 0),
        0
      );
    }
  }

  // Persist score
  await prisma.complianceScore.create({
    data: {
      projectId,
      score,
      details: JSON.parse(
        JSON.stringify({
          compliancePercentage,
          onTimeCount,
          totalCount,
          missedCount,
        })
      ),
      currentStreak,
      bestStreak,
      streakBrokenAt,
      protectedClaimsValue: new Prisma.Decimal(protectedClaimsValue),
      atRiskValue: new Prisma.Decimal(atRiskValue),
      onTimeCount,
      totalCount,
      missedCount,
      atRiskCount,
      activeCount,
      upcomingCount,
      lastCalculatedAt: new Date(),
    },
  });

  return {
    projectId,
    score,
    compliancePercentage,
    onTimeCount,
    totalCount,
    missedCount,
    currentStreak,
    bestStreak,
    streakBrokenAt,
    protectedClaimsValue,
    atRiskValue,
    atRiskCount,
    activeCount,
    upcomingCount,
    display: formatDisplay(
      compliancePercentage,
      currentStreak,
      protectedClaimsValue
    ),
  };
}

// ── Get Score (cached) ────────────────────────────────────────────────────

export async function getComplianceScore(
  projectId: string
): Promise<ComplianceScoreResult> {
  // Get latest score, recalculate if stale (>1 hour)
  const latest = await prisma.complianceScore.findFirst({
    where: { projectId },
    orderBy: { calculatedAt: "desc" },
  });

  if (latest) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (latest.lastCalculatedAt > oneHourAgo) {
      return {
        projectId,
        score: latest.score,
        compliancePercentage: latest.totalCount > 0
          ? (latest.onTimeCount / latest.totalCount) * 100
          : null,
        onTimeCount: latest.onTimeCount,
        totalCount: latest.totalCount,
        missedCount: latest.missedCount,
        currentStreak: latest.currentStreak,
        bestStreak: latest.bestStreak,
        streakBrokenAt: latest.streakBrokenAt,
        protectedClaimsValue: Number(latest.protectedClaimsValue),
        atRiskValue: Number(latest.atRiskValue),
        atRiskCount: latest.atRiskCount,
        activeCount: latest.activeCount,
        upcomingCount: latest.upcomingCount,
        display: formatDisplay(
          latest.totalCount > 0
            ? (latest.onTimeCount / latest.totalCount) * 100
            : null,
          latest.currentStreak,
          Number(latest.protectedClaimsValue)
        ),
      };
    }
  }

  return calculateComplianceScore(projectId);
}

// ── Score History ─────────────────────────────────────────────────────────

export async function saveScoreSnapshot(
  projectId: string,
  periodType: "daily" | "weekly" | "monthly"
): Promise<void> {
  const score = await getComplianceScore(projectId);

  await prisma.complianceScoreHistory.upsert({
    where: {
      projectId_snapshotDate_periodType: {
        projectId,
        snapshotDate: startOfDay(new Date()),
        periodType,
      },
    },
    update: {
      compliancePercentage: score.compliancePercentage
        ? new Prisma.Decimal(score.compliancePercentage)
        : null,
      onTimeCount: score.onTimeCount,
      totalCount: score.totalCount,
      protectedClaimsValue: new Prisma.Decimal(score.protectedClaimsValue),
    },
    create: {
      projectId,
      snapshotDate: startOfDay(new Date()),
      compliancePercentage: score.compliancePercentage
        ? new Prisma.Decimal(score.compliancePercentage)
        : null,
      onTimeCount: score.onTimeCount,
      totalCount: score.totalCount,
      protectedClaimsValue: new Prisma.Decimal(score.protectedClaimsValue),
      periodType,
    },
  });
}

export async function getScoreHistory(
  projectId: string,
  period: "week" | "month" | "quarter" | "year"
) {
  const daysBack =
    period === "week"
      ? 7
      : period === "month"
        ? 30
        : period === "quarter"
          ? 90
          : 365;
  const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  const history = await prisma.complianceScoreHistory.findMany({
    where: {
      projectId,
      snapshotDate: { gte: startDate },
    },
    orderBy: { snapshotDate: "asc" },
  });

  return history.map((h) => ({
    date: h.snapshotDate.toISOString().split("T")[0],
    compliancePercentage: h.compliancePercentage
      ? Number(h.compliancePercentage)
      : null,
    onTimeCount: h.onTimeCount,
    totalCount: h.totalCount,
    protectedClaimsValue: Number(h.protectedClaimsValue),
  }));
}

// ── Helpers ───────────────────────────────────────────────────────────────

function calculateStreak(
  notices: Array<{ onTimeStatus: boolean | null; sentAt: Date | null }>
): {
  currentStreak: number;
  bestStreak: number;
  streakBrokenAt: Date | null;
} {
  const sorted = [...notices]
    .filter((n) => n.sentAt)
    .sort((a, b) => b.sentAt!.getTime() - a.sentAt!.getTime());

  let currentStreak = 0;
  let streakBrokenAt: Date | null = null;

  for (const notice of sorted) {
    if (notice.onTimeStatus === true) {
      currentStreak++;
    } else {
      streakBrokenAt = notice.sentAt;
      break;
    }
  }

  // Best streak (chronological order)
  let bestStreak = 0;
  let tempStreak = 0;
  const chronological = [...sorted].reverse();
  for (const notice of chronological) {
    if (notice.onTimeStatus === true) {
      tempStreak++;
      bestStreak = Math.max(bestStreak, tempStreak);
    } else {
      tempStreak = 0;
    }
  }

  return { currentStreak, bestStreak, streakBrokenAt };
}

async function calculateProtectedClaimsValue(
  projectId: string
): Promise<number> {
  // Get on-time notices linked to deadlines with change event triggers
  const deadlines = await prisma.complianceDeadline.findMany({
    where: {
      projectId,
      status: "COMPLETED",
      triggerEventId: { not: null },
    },
    select: { triggerEventId: true },
  });

  if (deadlines.length === 0) {
    // Estimate based on on-time notice count
    const onTimeCount = await prisma.complianceNotice.count({
      where: { projectId, onTimeStatus: true },
    });
    return onTimeCount * 50000; // $50K average per notice (industry standard)
  }

  const eventIds = deadlines
    .map((d) => d.triggerEventId)
    .filter(Boolean) as string[];
  const events = await prisma.changeEvent.findMany({
    where: { id: { in: eventIds } },
    select: { estimatedValue: true },
  });

  const total = events.reduce(
    (sum, e) => sum + (e.estimatedValue ? Number(e.estimatedValue) : 50000),
    0
  );

  return total;
}

function getVerdict(percentage: number | null): string {
  if (percentage === null) return "No notices tracked yet";
  if (percentage >= 100) return "Excellent compliance";
  if (percentage >= 95) return "Strong compliance";
  if (percentage >= 90) return "Good compliance";
  if (percentage >= 80) return "Fair compliance — room for improvement";
  if (percentage >= 60) return "Poor compliance — action needed";
  return "Critical — immediate action required";
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatDisplay(
  compliancePercentage: number | null,
  currentStreak: number,
  protectedClaimsValue: number
) {
  return {
    scorePercentage:
      compliancePercentage !== null
        ? `${compliancePercentage.toFixed(0)}%`
        : "100%",
    streakDisplay:
      currentStreak > 0
        ? `${currentStreak} consecutive on time`
        : "No active streak",
    protectedValue: `${formatCurrency(protectedClaimsValue)} protected`,
    verdict: getVerdict(compliancePercentage),
  };
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
