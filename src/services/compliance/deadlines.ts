import { prisma } from "@/lib/db";
import type {
  DeadlineStatus,
  TriggerEventType,
  Severity,
  ComplianceDeadline,
} from "@prisma/client";
import { calculateDeadline, calculateDaysRemaining } from "./calculator";
import { calculateSeverity } from "./severity";

// ── Types ─────────────────────────────────────────────────────────────────

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
  projectId: string;
  clauseId: string;
  sectionRef: string | null;
  clauseTitle: string;
  clauseKind: string;
  triggerEventType: TriggerEventType;
  triggerDescription: string;
  triggeredAt: Date;
  calculatedDeadline: Date;
  daysRemaining: number;
  hoursRemaining: number;
  severity: Severity;
  status: DeadlineStatus;
  noticeId: string | null;
  noticeCreatedAt: Date | null;
  waivedAt: Date | null;
  waiverReason: string | null;
  createdAt: Date;
}

interface DeadlineListResult {
  activeCritical: number;
  activeWarning: number;
  totalActive: number;
  total: number;
  deadlines: DeadlineWithCountdown[];
}

// ── Create ────────────────────────────────────────────────────────────────

export async function createDeadline(
  params: CreateDeadlineParams
): Promise<ComplianceDeadline> {
  const {
    projectId,
    clauseId,
    triggerEventType,
    triggerEventId,
    triggerDescription,
    triggeredAt,
    triggeredBy,
  } = params;

  // Get the clause for deadline calculation
  const clause = await prisma.contractClause.findUnique({
    where: { id: clauseId },
  });
  if (!clause) {
    throw new Error(`Clause not found: ${clauseId}`);
  }
  if (!clause.deadlineDays || !clause.deadlineType) {
    throw new Error(
      `Clause ${clauseId} has no deadline configured (deadlineDays or deadlineType missing)`
    );
  }

  // Calculate the deadline date
  const result = await calculateDeadline({
    triggerDate: triggeredAt,
    deadlineDays: clause.deadlineDays,
    deadlineType: clause.deadlineType,
    curePeriodDays: clause.curePeriodDays ?? undefined,
    curePeriodType: clause.curePeriodType ?? undefined,
    projectId,
  });

  // Determine initial severity
  const { severity } = calculateSeverity(result.calculatedDeadline);

  // Create deadline record
  const deadline = await prisma.complianceDeadline.create({
    data: {
      projectId,
      clauseId,
      triggerEventType,
      triggerEventId: triggerEventId || null,
      triggerDescription,
      triggeredAt,
      triggeredBy: triggeredBy || null,
      calculatedDeadline: result.calculatedDeadline,
      status: "ACTIVE",
      severity,
    },
  });

  // Audit log
  await prisma.complianceAuditLog.create({
    data: {
      projectId,
      eventType: "DEADLINE_CREATED",
      entityType: "ComplianceDeadline",
      entityId: deadline.id,
      userId: triggeredBy || null,
      actorType: triggeredBy ? "USER" : "SYSTEM",
      action: "created",
      details: JSON.parse(
        JSON.stringify({
          sectionRef: clause.sectionRef,
          triggerEventType,
          calculatedDeadline: result.calculatedDeadline.toISOString(),
          calendarDaysCount: result.calendarDaysCount,
          severity,
        })
      ),
    },
  });

  return deadline;
}

// ── Query ─────────────────────────────────────────────────────────────────

export async function getProjectDeadlines(
  projectId: string,
  filters?: {
    status?: DeadlineStatus;
    severity?: Severity;
    sortBy?: "deadline" | "severity" | "created";
  }
): Promise<DeadlineListResult> {
  const deadlines = await prisma.complianceDeadline.findMany({
    where: {
      projectId,
      ...(filters?.status && { status: filters.status }),
      ...(filters?.severity && { severity: filters.severity }),
    },
    include: {
      clause: {
        select: {
          sectionRef: true,
          title: true,
          kind: true,
        },
      },
    },
    orderBy: { calculatedDeadline: "asc" },
  });

  const now = new Date();

  const withCountdown: DeadlineWithCountdown[] = deadlines.map((d) => {
    const daysRemaining = calculateDaysRemaining(d.calculatedDeadline, now);
    const hoursRemaining = Math.max(
      0,
      Math.ceil(
        (d.calculatedDeadline.getTime() - now.getTime()) / (1000 * 60 * 60)
      )
    );

    return {
      id: d.id,
      projectId: d.projectId,
      clauseId: d.clauseId,
      sectionRef: d.clause.sectionRef,
      clauseTitle: d.clause.title,
      clauseKind: d.clause.kind,
      triggerEventType: d.triggerEventType,
      triggerDescription: d.triggerDescription,
      triggeredAt: d.triggeredAt,
      calculatedDeadline: d.calculatedDeadline,
      daysRemaining,
      hoursRemaining,
      severity: d.severity,
      status: d.status,
      noticeId: d.noticeId,
      noticeCreatedAt: d.noticeCreatedAt,
      waivedAt: d.waivedAt,
      waiverReason: d.waiverReason,
      createdAt: d.createdAt,
    };
  });

  // Sort
  if (filters?.sortBy === "severity") {
    const order: Record<string, number> = {
      EXPIRED: 0,
      CRITICAL: 1,
      WARNING: 2,
      INFO: 3,
      LOW: 4,
    };
    withCountdown.sort(
      (a, b) => (order[a.severity] ?? 5) - (order[b.severity] ?? 5)
    );
  } else if (filters?.sortBy === "created") {
    withCountdown.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }
  // default sort is by calculatedDeadline (already from DB query)

  const active = withCountdown.filter((d) => d.status === "ACTIVE");

  return {
    activeCritical: active.filter(
      (d) => d.severity === "CRITICAL" || d.severity === "EXPIRED"
    ).length,
    activeWarning: active.filter((d) => d.severity === "WARNING").length,
    totalActive: active.length,
    total: withCountdown.length,
    deadlines: withCountdown,
  };
}

// ── Waive ─────────────────────────────────────────────────────────────────

export async function waiveDeadline(
  deadlineId: string,
  userId: string,
  reason: string
): Promise<ComplianceDeadline> {
  const deadline = await prisma.complianceDeadline.update({
    where: { id: deadlineId },
    data: {
      status: "WAIVED",
      waivedAt: new Date(),
      waivedBy: userId,
      waiverReason: reason,
    },
  });

  await prisma.complianceAuditLog.create({
    data: {
      projectId: deadline.projectId,
      eventType: "DEADLINE_WAIVED",
      entityType: "ComplianceDeadline",
      entityId: deadlineId,
      userId,
      actorType: "USER",
      action: "waived",
      details: JSON.parse(JSON.stringify({ reason })),
    },
  });

  return deadline;
}

// ── Severity refresh (called by cron) ─────────────────────────────────────

export async function updateAllDeadlineSeverities(): Promise<{
  updated: number;
  expired: number;
}> {
  const activeDeadlines = await prisma.complianceDeadline.findMany({
    where: { status: "ACTIVE" },
  });

  let updated = 0;
  let expired = 0;

  for (const deadline of activeDeadlines) {
    const { severity } = calculateSeverity(deadline.calculatedDeadline);

    if (severity !== deadline.severity) {
      const newStatus: DeadlineStatus =
        severity === "EXPIRED" ? "EXPIRED" : deadline.status;

      await prisma.complianceDeadline.update({
        where: { id: deadline.id },
        data: { severity, status: newStatus },
      });
      updated++;

      if (severity === "EXPIRED") {
        expired++;

        await prisma.complianceAuditLog.create({
          data: {
            projectId: deadline.projectId,
            eventType: "DEADLINE_EXPIRED",
            entityType: "ComplianceDeadline",
            entityId: deadline.id,
            actorType: "SYSTEM",
            action: "expired",
            details: JSON.parse(
              JSON.stringify({
                calculatedDeadline:
                  deadline.calculatedDeadline.toISOString(),
                consequence: "Claim forfeiture risk",
              })
            ),
          },
        });
      }
    }
  }

  return { updated, expired };
}
