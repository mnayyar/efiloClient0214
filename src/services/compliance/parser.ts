import { prisma } from "@/lib/db";
import { generateResponse } from "@/lib/ai";
import { detectContractType, type ContractTypeKey } from "./contract-types";
import {
  CLAUSE_EXTRACTION_SYSTEM_PROMPT,
  buildExtractionPrompt,
} from "./prompts";
import { CONTRACT_TYPES } from "./contract-types";
import type {
  ContractClauseKind,
  DeadlineType,
  ContractClauseMethod,
  ContractClause,
} from "@prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────

interface ParsedClause {
  sectionRef: string | null;
  title: string;
  content: string;
  kind: string;
  deadlineDays: number | null;
  deadlineType: string | null;
  noticeMethod: string | null;
  trigger: string | null;
  curePeriodDays: number | null;
  curePeriodType: string | null;
  flowDownProvisions: string | null;
  parentClauseRef: string | null;
  requiresReview: boolean;
  reviewReason: string | null;
  notes: string | null;
}

interface Ambiguity {
  sectionRef: string;
  issue: string;
  recommendation: string;
}

interface ExtractionResult {
  clauses: ParsedClause[];
  ambiguities: Ambiguity[];
  contractTypeSummary?: string;
}

interface ParseContractParams {
  projectId: string;
  documentId: string;
  contractText: string;
  contractType?: ContractTypeKey;
  userId?: string;
}

interface ParseContractResult {
  clauses: ContractClause[];
  ambiguities: Ambiguity[];
  requiresReviewCount: number;
  contractType: ContractTypeKey;
  contractTypeName: string;
  tokensUsed: { input: number; output: number };
}

// ── Validation helpers ────────────────────────────────────────────────────

const VALID_KINDS: Set<string> = new Set([
  "PAYMENT_TERMS",
  "CHANGE_ORDER_PROCESS",
  "CLAIMS_PROCEDURE",
  "DISPUTE_RESOLUTION",
  "NOTICE_REQUIREMENTS",
  "RETENTION",
  "WARRANTY",
  "INSURANCE",
  "INDEMNIFICATION",
  "TERMINATION",
  "FORCE_MAJEURE",
  "LIQUIDATED_DAMAGES",
  "SCHEDULE",
  "SAFETY",
  "GENERAL_CONDITIONS",
  "SUPPLEMENTARY_CONDITIONS",
]);

const VALID_DEADLINE_TYPES: Set<string> = new Set([
  "CALENDAR_DAYS",
  "BUSINESS_DAYS",
  "HOURS",
]);

const VALID_NOTICE_METHODS: Set<string> = new Set([
  "WRITTEN_NOTICE",
  "CERTIFIED_MAIL",
  "EMAIL",
  "HAND_DELIVERY",
  "REGISTERED_MAIL",
]);

function validateKind(kind: string): ContractClauseKind {
  if (VALID_KINDS.has(kind)) return kind as ContractClauseKind;
  return "NOTICE_REQUIREMENTS";
}

function validateDeadlineType(dt: string | null): DeadlineType | null {
  if (dt && VALID_DEADLINE_TYPES.has(dt)) return dt as DeadlineType;
  return null;
}

function validateNoticeMethod(nm: string | null): ContractClauseMethod | null {
  if (nm && VALID_NOTICE_METHODS.has(nm)) return nm as ContractClauseMethod;
  return null;
}

// ── Parser ────────────────────────────────────────────────────────────────

const MAX_CONTRACT_LENGTH = 100_000; // ~25k tokens

export async function parseContract(
  params: ParseContractParams
): Promise<ParseContractResult> {
  const { projectId, documentId, contractText, userId } = params;

  // Detect contract type
  const detectedType = params.contractType ?? detectContractType(contractText);
  const contractTypeName = CONTRACT_TYPES[detectedType].name;

  // Truncate if too long
  const text = contractText.slice(0, MAX_CONTRACT_LENGTH);

  // Call Claude via shared AI service
  const aiResponse = await generateResponse({
    systemPrompt: CLAUSE_EXTRACTION_SYSTEM_PROMPT,
    userPrompt: buildExtractionPrompt(text, contractTypeName),
    model: "sonnet",
    maxTokens: 4096,
    temperature: 0.1,
  });

  // Parse JSON response — strip markdown fences if present
  let jsonStr = aiResponse.content.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let result: ExtractionResult;
  try {
    result = JSON.parse(jsonStr);
  } catch {
    throw new Error(
      `Failed to parse AI response as JSON: ${jsonStr.slice(0, 200)}`
    );
  }

  if (!Array.isArray(result.clauses)) {
    throw new Error("AI response missing clauses array");
  }

  // Persist clauses to DB
  const createdClauses: ContractClause[] = [];

  for (const parsed of result.clauses) {
    const clause = await prisma.contractClause.create({
      data: {
        projectId,
        kind: validateKind(parsed.kind),
        title: parsed.title,
        content: parsed.content || parsed.notes || "",
        sectionRef: parsed.sectionRef || null,
        deadlineDays: parsed.deadlineDays,
        deadlineType: validateDeadlineType(parsed.deadlineType),
        noticeMethod: validateNoticeMethod(parsed.noticeMethod),
        trigger: parsed.trigger || null,
        curePeriodDays: parsed.curePeriodDays,
        curePeriodType: validateDeadlineType(parsed.curePeriodType),
        flowDownProvisions: parsed.flowDownProvisions || null,
        parentClauseRef: parsed.parentClauseRef || null,
        requiresReview: parsed.requiresReview ?? false,
        reviewReason: parsed.reviewReason || null,
        confirmed: !(parsed.requiresReview ?? false),
        confirmedAt: !(parsed.requiresReview ?? false) ? new Date() : null,
        confirmedBy: !(parsed.requiresReview ?? false) ? "AI" : null,
        aiExtracted: true,
        aiModel: aiResponse.model,
        sourceDocId: documentId,
      },
    });
    createdClauses.push(clause);
  }

  // Create audit log entry
  await prisma.complianceAuditLog.create({
    data: {
      projectId,
      eventType: "CONTRACT_PARSED",
      entityType: "Document",
      entityId: documentId,
      actorType: userId ? "USER" : "SYSTEM",
      userId: userId || null,
      action: "parsed",
      details: JSON.parse(
        JSON.stringify({
          contractType: detectedType,
          contractTypeName,
          clausesFound: createdClauses.length,
          requiresReviewCount: createdClauses.filter((c) => c.requiresReview)
            .length,
          ambiguousCount: result.ambiguities?.length ?? 0,
          ambiguities: result.ambiguities ?? [],
          tokensUsed: aiResponse.tokensUsed,
          latencyMs: aiResponse.latencyMs,
        })
      ),
    },
  });

  return {
    clauses: createdClauses,
    ambiguities: result.ambiguities ?? [],
    requiresReviewCount: createdClauses.filter((c) => c.requiresReview).length,
    contractType: detectedType,
    contractTypeName,
    tokensUsed: aiResponse.tokensUsed,
  };
}

// ── Confirm / Update Clause ───────────────────────────────────────────────

interface ConfirmClauseUpdates {
  deadlineDays?: number;
  deadlineType?: string;
  noticeMethod?: string;
  trigger?: string;
  curePeriodDays?: number;
  curePeriodType?: string;
}

export async function confirmClause(
  clauseId: string,
  userId: string,
  updates?: ConfirmClauseUpdates
) {
  const clause = await prisma.contractClause.update({
    where: { id: clauseId },
    data: {
      ...(updates?.deadlineDays !== undefined && {
        deadlineDays: updates.deadlineDays,
      }),
      ...(updates?.deadlineType && {
        deadlineType: validateDeadlineType(updates.deadlineType),
      }),
      ...(updates?.noticeMethod && {
        noticeMethod: validateNoticeMethod(updates.noticeMethod),
      }),
      ...(updates?.trigger && { trigger: updates.trigger }),
      ...(updates?.curePeriodDays !== undefined && {
        curePeriodDays: updates.curePeriodDays,
      }),
      ...(updates?.curePeriodType && {
        curePeriodType: validateDeadlineType(updates.curePeriodType),
      }),
      requiresReview: false,
      confirmed: true,
      confirmedAt: new Date(),
      confirmedBy: userId,
    },
  });

  await prisma.complianceAuditLog.create({
    data: {
      projectId: clause.projectId,
      eventType: "CLAUSE_CONFIRMED",
      entityType: "ContractClause",
      entityId: clauseId,
      actorType: "USER",
      userId,
      action: "confirmed",
      details: updates ? JSON.parse(JSON.stringify({ updates })) : null,
    },
  });

  return clause;
}

// ── Query Clauses ─────────────────────────────────────────────────────────

interface ClauseFilters {
  kind?: string;
  requiresReview?: boolean;
  sourceDocId?: string;
}

export async function getProjectClauses(
  projectId: string,
  filters?: ClauseFilters
) {
  return prisma.contractClause.findMany({
    where: {
      projectId,
      ...(filters?.kind && { kind: filters.kind as ContractClauseKind }),
      ...(filters?.requiresReview !== undefined && {
        requiresReview: filters.requiresReview,
      }),
      ...(filters?.sourceDocId && { sourceDocId: filters.sourceDocId }),
    },
    orderBy: { createdAt: "desc" },
  });
}
