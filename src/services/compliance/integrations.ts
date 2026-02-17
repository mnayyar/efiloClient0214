import { prisma } from "@/lib/db";
import type { TriggerEventType } from "@prisma/client";
import { createDeadline } from "./deadlines";
import { getComplianceScore } from "./scoring";

// ── Types ─────────────────────────────────────────────────────────────────

interface ComplianceCheckResult {
  deadlinesCreated: number;
  deadlineIds: string[];
  skippedReasons: string[];
}

interface ComplianceHealthComponent {
  name: string;
  score: number;
  weight: number;
  status: "good" | "warning" | "critical";
  details: {
    compliancePercentage: number | null;
    onTimeCount: number;
    totalCount: number;
    currentStreak: number;
    protectedClaimsValue: number;
    atRiskCount: number;
    activeDeadlines: number;
  };
}

interface ComplianceSearchResult {
  id: string;
  type: "contract_clause" | "compliance_deadline" | "compliance_notice";
  title: string;
  description: string;
  status: string;
  severity?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ── RFI → Compliance Integration ──────────────────────────────────────────

/**
 * Check if an RFI triggers compliance deadlines.
 * Called after RFI creation or when coFlag/coEstimate changes.
 */
export async function checkRfiCompliance(
  rfiId: string,
  triggeredBy?: string
): Promise<ComplianceCheckResult> {
  const rfi = await prisma.rFI.findUnique({ where: { id: rfiId } });
  if (!rfi) {
    return { deadlinesCreated: 0, deadlineIds: [], skippedReasons: ["RFI not found"] };
  }

  const deadlineIds: string[] = [];
  const skippedReasons: string[] = [];

  // Get confirmed clauses for this project
  const clauses = await prisma.contractClause.findMany({
    where: { projectId: rfi.projectId, confirmed: true },
  });

  if (clauses.length === 0) {
    return {
      deadlinesCreated: 0,
      deadlineIds: [],
      skippedReasons: ["No confirmed clauses for this project"],
    };
  }

  // Check for existing deadlines linked to this RFI to avoid duplicates
  const existingDeadlines = await prisma.complianceDeadline.findMany({
    where: { triggerEventId: rfiId, triggerEventType: "RFI" },
    select: { clauseId: true },
  });
  const existingClauseIds = new Set(existingDeadlines.map((d) => d.clauseId));

  // If RFI has change order flag (cost impact), check for claims/change order clauses
  if (rfi.coFlag) {
    const claimClauses = clauses.filter((c) =>
      ["CLAIMS_PROCEDURE", "CHANGE_ORDER_PROCESS"].includes(c.kind)
    );

    for (const clause of claimClauses) {
      if (existingClauseIds.has(clause.id)) {
        skippedReasons.push(
          `Deadline already exists for clause ${clause.sectionRef ?? clause.id}`
        );
        continue;
      }
      if (!clause.deadlineDays || !clause.deadlineType) {
        skippedReasons.push(
          `Clause ${clause.sectionRef ?? clause.id} has no deadline configured`
        );
        continue;
      }

      try {
        const deadline = await createDeadline({
          projectId: rfi.projectId,
          clauseId: clause.id,
          triggerEventType: "RFI" as TriggerEventType,
          triggerEventId: rfi.id,
          triggerDescription: `RFI #${rfi.rfiNumber}: ${rfi.subject}${rfi.coEstimate ? ` (Est. CO: $${Number(rfi.coEstimate).toLocaleString()})` : " (CO flagged)"}`,
          triggeredAt: rfi.createdAt,
          triggeredBy,
        });
        deadlineIds.push(deadline.id);
      } catch (err) {
        skippedReasons.push(
          `Failed for clause ${clause.sectionRef ?? clause.id}: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }
    }
  }

  // Log to audit
  if (deadlineIds.length > 0) {
    await prisma.complianceAuditLog.create({
      data: {
        projectId: rfi.projectId,
        eventType: "RFI_COMPLIANCE_CHECK",
        entityType: "RFI",
        entityId: rfiId,
        userId: triggeredBy ?? null,
        actorType: triggeredBy ? "USER" : "SYSTEM",
        action: "checked",
        details: JSON.parse(
          JSON.stringify({
            deadlinesCreated: deadlineIds.length,
            deadlineIds,
            rfiNumber: rfi.rfiNumber,
            coFlag: rfi.coFlag,
            coEstimate: rfi.coEstimate ? Number(rfi.coEstimate) : null,
          })
        ),
      },
    });
  }

  return {
    deadlinesCreated: deadlineIds.length,
    deadlineIds,
    skippedReasons,
  };
}

// ── Change Event → Compliance Integration ─────────────────────────────────

/**
 * Check if a change event triggers compliance deadlines.
 * Maps ChangeEventType to ContractClauseKind for matching.
 */
export async function checkChangeEventCompliance(
  changeEventId: string,
  triggeredBy?: string
): Promise<ComplianceCheckResult> {
  const change = await prisma.changeEvent.findUnique({
    where: { id: changeEventId },
  });
  if (!change) {
    return {
      deadlinesCreated: 0,
      deadlineIds: [],
      skippedReasons: ["Change event not found"],
    };
  }

  const deadlineIds: string[] = [];
  const skippedReasons: string[] = [];

  const clauses = await prisma.contractClause.findMany({
    where: { projectId: change.projectId, confirmed: true },
  });

  if (clauses.length === 0) {
    return {
      deadlinesCreated: 0,
      deadlineIds: [],
      skippedReasons: ["No confirmed clauses for this project"],
    };
  }

  // Check for existing deadlines to avoid duplicates
  const existingDeadlines = await prisma.complianceDeadline.findMany({
    where: { triggerEventId: changeEventId, triggerEventType: "CHANGE_ORDER" },
    select: { clauseId: true },
  });
  const existingClauseIds = new Set(existingDeadlines.map((d) => d.clauseId));

  // Map change event type to relevant contract clause kinds
  const clauseKindMap: Record<string, string[]> = {
    SCOPE_CHANGE: ["CLAIMS_PROCEDURE", "CHANGE_ORDER_PROCESS"],
    DESIGN_ERROR: ["CLAIMS_PROCEDURE", "NOTICE_REQUIREMENTS"],
    UNFORESEEN_CONDITION: ["CLAIMS_PROCEDURE", "NOTICE_REQUIREMENTS"],
    OWNER_DIRECTIVE: ["CHANGE_ORDER_PROCESS", "CLAIMS_PROCEDURE"],
    SCHEDULE_IMPACT: ["CLAIMS_PROCEDURE", "NOTICE_REQUIREMENTS"],
    REGULATORY: ["CHANGE_ORDER_PROCESS", "NOTICE_REQUIREMENTS"],
  };

  const targetKinds = clauseKindMap[change.type] ?? ["CLAIMS_PROCEDURE"];
  const matchingClauses = clauses.filter((c) =>
    targetKinds.includes(c.kind)
  );

  const valueStr = change.estimatedValue
    ? ` ($${Number(change.estimatedValue).toLocaleString()})`
    : "";

  for (const clause of matchingClauses) {
    if (existingClauseIds.has(clause.id)) {
      skippedReasons.push(
        `Deadline already exists for clause ${clause.sectionRef ?? clause.id}`
      );
      continue;
    }
    if (!clause.deadlineDays || !clause.deadlineType) {
      skippedReasons.push(
        `Clause ${clause.sectionRef ?? clause.id} has no deadline configured`
      );
      continue;
    }

    try {
      const deadline = await createDeadline({
        projectId: change.projectId,
        clauseId: clause.id,
        triggerEventType: "CHANGE_ORDER" as TriggerEventType,
        triggerEventId: change.id,
        triggerDescription: `${change.type.replace(/_/g, " ")}: ${change.title}${valueStr}`,
        triggeredAt: change.createdAt,
        triggeredBy,
      });
      deadlineIds.push(deadline.id);
    } catch (err) {
      skippedReasons.push(
        `Failed for clause ${clause.sectionRef ?? clause.id}: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  }

  if (deadlineIds.length > 0) {
    await prisma.complianceAuditLog.create({
      data: {
        projectId: change.projectId,
        eventType: "CHANGE_EVENT_COMPLIANCE_CHECK",
        entityType: "ChangeEvent",
        entityId: changeEventId,
        userId: triggeredBy ?? null,
        actorType: triggeredBy ? "USER" : "SYSTEM",
        action: "checked",
        details: JSON.parse(
          JSON.stringify({
            deadlinesCreated: deadlineIds.length,
            deadlineIds,
            changeType: change.type,
            estimatedValue: change.estimatedValue
              ? Number(change.estimatedValue)
              : null,
          })
        ),
      },
    });
  }

  return {
    deadlinesCreated: deadlineIds.length,
    deadlineIds,
    skippedReasons,
  };
}

// ── Project Health Integration ────────────────────────────────────────────

/**
 * Get compliance as a component of project health (20% weight).
 * Used by the HealthScore calculation pipeline.
 */
export async function getComplianceHealthComponent(
  projectId: string
): Promise<ComplianceHealthComponent> {
  const score = await getComplianceScore(projectId);

  const weight = 0.2; // 20% of overall project health

  // Start with compliance percentage, default 100 if no notices yet
  let componentScore =
    score.compliancePercentage !== null
      ? score.compliancePercentage
      : 100;

  // Penalize for at-risk deadlines
  if (score.atRiskCount > 0) {
    componentScore = Math.max(0, componentScore - score.atRiskCount * 5);
  }

  componentScore = Math.round(componentScore);

  let status: "good" | "warning" | "critical" = "good";
  if (componentScore < 80 || score.atRiskCount > 2) {
    status = "warning";
  }
  if (componentScore < 60 || score.atRiskCount > 5) {
    status = "critical";
  }

  return {
    name: "Contract Compliance",
    score: componentScore,
    weight,
    status,
    details: {
      compliancePercentage: score.compliancePercentage,
      onTimeCount: score.onTimeCount,
      totalCount: score.totalCount,
      currentStreak: score.currentStreak,
      protectedClaimsValue: score.protectedClaimsValue,
      atRiskCount: score.atRiskCount,
      activeDeadlines: score.activeCount,
    },
  };
}

// ── Compliance Search ─────────────────────────────────────────────────────

/**
 * Search compliance data (clauses, deadlines, notices) by keyword.
 * Returns structured results for the compliance search endpoint.
 */
export async function searchComplianceData(
  projectId: string,
  query: string,
  filters?: {
    types?: ("contract_clause" | "compliance_deadline" | "compliance_notice")[];
    status?: string;
    severity?: string;
  }
): Promise<ComplianceSearchResult[]> {
  const results: ComplianceSearchResult[] = [];
  const searchTerm = `%${query}%`;
  const types = filters?.types ?? [
    "contract_clause",
    "compliance_deadline",
    "compliance_notice",
  ];

  // Search contract clauses
  if (types.includes("contract_clause")) {
    const clauses = await prisma.contractClause.findMany({
      where: {
        projectId,
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { content: { contains: query, mode: "insensitive" } },
          { sectionRef: { contains: query, mode: "insensitive" } },
          { trigger: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    for (const c of clauses) {
      results.push({
        id: c.id,
        type: "contract_clause",
        title: `${c.sectionRef ?? ""} ${c.title}`.trim(),
        description: `${c.kind.replace(/_/g, " ")} · ${c.deadlineDays ?? "N/A"} ${(c.deadlineType ?? "").replace(/_/g, " ").toLowerCase()} · ${c.noticeMethod?.replace(/_/g, " ").toLowerCase() ?? "N/A"}`,
        status: c.confirmed ? "Confirmed" : c.requiresReview ? "Needs Review" : "Pending",
        metadata: {
          kind: c.kind,
          deadlineDays: c.deadlineDays,
          deadlineType: c.deadlineType,
          noticeMethod: c.noticeMethod,
          aiExtracted: c.aiExtracted,
        },
        createdAt: c.createdAt.toISOString(),
      });
    }
  }

  // Search compliance deadlines
  if (types.includes("compliance_deadline")) {
    const deadlines = await prisma.complianceDeadline.findMany({
      where: {
        projectId,
        ...(filters?.status && { status: filters.status as any }),
        ...(filters?.severity && { severity: filters.severity as any }),
        OR: [
          { triggerDescription: { contains: query, mode: "insensitive" } },
        ],
      },
      include: {
        clause: { select: { title: true, sectionRef: true, kind: true } },
      },
      orderBy: { calculatedDeadline: "asc" },
      take: 20,
    });

    for (const d of deadlines) {
      results.push({
        id: d.id,
        type: "compliance_deadline",
        title: `Deadline: ${d.clause.title} (${d.clause.sectionRef ?? "N/A"})`,
        description: d.triggerDescription,
        status: d.status,
        severity: d.severity,
        metadata: {
          clauseId: d.clauseId,
          clauseKind: d.clause.kind,
          calculatedDeadline: d.calculatedDeadline.toISOString(),
          triggerEventType: d.triggerEventType,
          triggerEventId: d.triggerEventId,
        },
        createdAt: d.createdAt.toISOString(),
      });
    }
  }

  // Search compliance notices
  if (types.includes("compliance_notice")) {
    const notices = await prisma.complianceNotice.findMany({
      where: {
        projectId,
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { content: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    for (const n of notices) {
      results.push({
        id: n.id,
        type: "compliance_notice",
        title: n.title,
        description: `${n.type.replace(/_/g, " ")} · ${n.status} · ${n.sentAt ? `Sent ${n.sentAt.toISOString().split("T")[0]}` : "Not sent"}`,
        status: n.status,
        metadata: {
          noticeType: n.type,
          sentAt: n.sentAt?.toISOString() ?? null,
          onTimeStatus: n.onTimeStatus,
          generatedByAI: n.generatedByAI,
        },
        createdAt: n.createdAt.toISOString(),
      });
    }
  }

  return results;
}
