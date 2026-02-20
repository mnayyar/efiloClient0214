import { api } from "./client";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ComplianceScore {
  id: string;
  projectId: string;
  score: number;
  details: Record<string, unknown> | null;
  currentStreak: number;
  bestStreak: number;
  streakBrokenAt: string | null;
  protectedClaimsValue: string;
  atRiskValue: string;
  onTimeCount: number;
  totalCount: number;
  missedCount: number;
  atRiskCount: number;
  activeCount: number;
  upcomingCount: number;
  lastCalculatedAt: string | null;
}

export interface ScoreHistoryItem {
  id: string;
  snapshotDate: string;
  compliancePercentage: string | null;
  onTimeCount: number;
  totalCount: number;
  noticesSentInPeriod: number;
  protectedClaimsValue: string;
  periodType: string;
}

export interface Deadline {
  id: string;
  projectId: string;
  clauseId: string;
  triggerEventType: string;
  triggerEventId: string | null;
  triggerDescription: string;
  triggeredAt: string;
  triggeredBy: string;
  calculatedDeadline: string;
  status: string;
  severity: string;
  noticeId: string | null;
  noticeCreatedAt: string | null;
  waivedAt: string | null;
  waivedBy: string | null;
  waiverReason: string | null;
  clauseTitle: string;
  clauseKind: string;
  clauseSectionRef: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Clause {
  id: string;
  projectId: string;
  kind: string;
  title: string;
  content: string;
  sectionRef: string | null;
  deadlineDays: number | null;
  deadlineType: string | null;
  noticeMethod: string | null;
  trigger: string | null;
  curePeriodDays: number | null;
  curePeriodType: string | null;
  flowDownProvisions: boolean;
  parentClauseRef: string | null;
  requiresReview: boolean;
  reviewReason: string | null;
  confirmed: boolean;
  confirmedAt: string | null;
  confirmedBy: string | null;
  aiExtracted: boolean;
  aiModel: string | null;
  sourceDocId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Notice {
  id: string;
  projectId: string;
  type: string;
  status: string;
  title: string;
  content: string;
  recipientName: string | null;
  recipientEmail: string | null;
  dueDate: string | null;
  sentAt: string | null;
  acknowledgedAt: string | null;
  clauseId: string | null;
  deliveryMethods: string[];
  deliveryConfirmation: Record<string, unknown> | null;
  deliveredAt: string | null;
  onTimeStatus: boolean | null;
  generatedByAI: boolean;
  aiModel: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoticeInput {
  type: string;
  title: string;
  clauseId?: string;
  generateWithAi?: boolean;
  triggerDescription?: string;
  triggerDate?: string;
  deadlineDate?: string;
  recipientName?: string;
  recipientEmail?: string;
  deadlineId?: string;
  additionalContext?: string;
}

export interface UpdateNoticeInput {
  title?: string;
  content?: string;
  status?: string;
  recipientName?: string;
  recipientEmail?: string;
}

// ─── Score ───────────────────────────────────────────────────────────────────

export async function getScore(projectId: string): Promise<ComplianceScore> {
  const { data } = await api.get<{ data: ComplianceScore }>(
    `/api/projects/${projectId}/compliance/score`
  );
  return data;
}

export async function getScoreHistory(
  projectId: string,
  period = "month",
  limit = 30
): Promise<ScoreHistoryItem[]> {
  const { data } = await api.get<{ data: { history: ScoreHistoryItem[] } }>(
    `/api/projects/${projectId}/compliance/score/history?period=${period}&limit=${limit}`
  );
  return data.history;
}

export async function recalculateScore(
  projectId: string
): Promise<ComplianceScore> {
  const { data } = await api.post<{ data: ComplianceScore }>(
    `/api/projects/${projectId}/compliance/score/recalculate`
  );
  return data;
}

// ─── Deadlines ──────────────────────────────────────────────────────────────

export async function getDeadlines(
  projectId: string,
  params?: { status?: string; severity?: string }
): Promise<Deadline[]> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.severity) searchParams.set("severity", params.severity);
  const qs = searchParams.toString();
  const { data } = await api.get<{ data: Deadline[] }>(
    `/api/projects/${projectId}/compliance/deadlines${qs ? `?${qs}` : ""}`
  );
  return data;
}

export async function waiveDeadline(
  projectId: string,
  deadlineId: string,
  reason: string
): Promise<Deadline> {
  const { data } = await api.post<{ data: Deadline }>(
    `/api/projects/${projectId}/compliance/deadlines/${deadlineId}/waive`,
    { reason }
  );
  return data;
}

// ─── Clauses ────────────────────────────────────────────────────────────────

export async function getClauses(
  projectId: string,
  params?: { kind?: string; confirmed?: boolean }
): Promise<{ clauses: Clause[]; total: number; requiresReviewCount: number }> {
  const searchParams = new URLSearchParams();
  if (params?.kind) searchParams.set("kind", params.kind);
  if (params?.confirmed !== undefined)
    searchParams.set("confirmed", String(params.confirmed));
  const qs = searchParams.toString();
  const { data } = await api.get<{
    data: { clauses: Clause[]; total: number; requiresReviewCount: number };
  }>(
    `/api/projects/${projectId}/compliance/clauses${qs ? `?${qs}` : ""}`
  );
  return data;
}

export async function parseContract(
  projectId: string,
  documentId: string
): Promise<{ clausesExtracted: number; clauses: Clause[] }> {
  const { data } = await api.post<{
    data: { clausesExtracted: number; clauses: Clause[] };
  }>(`/api/projects/${projectId}/compliance/parse-contract`, {
    documentId,
  });
  return data;
}

export async function confirmClause(
  projectId: string,
  clauseId: string
): Promise<Clause> {
  const { data } = await api.patch<{ data: Clause }>(
    `/api/projects/${projectId}/compliance/clauses/${clauseId}/confirm`
  );
  return data;
}

// ─── Notices ────────────────────────────────────────────────────────────────

export async function getNotices(
  projectId: string,
  params?: { status?: string; type?: string }
): Promise<Notice[]> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.type) searchParams.set("type", params.type);
  const qs = searchParams.toString();
  const { data } = await api.get<{ data: Notice[] }>(
    `/api/projects/${projectId}/compliance/notices${qs ? `?${qs}` : ""}`
  );
  return data;
}

export async function createNotice(
  projectId: string,
  input: CreateNoticeInput
): Promise<Notice> {
  const { data } = await api.post<{ data: Notice }>(
    `/api/projects/${projectId}/compliance/notices`,
    input
  );
  return data;
}

export async function updateNotice(
  projectId: string,
  noticeId: string,
  input: UpdateNoticeInput
): Promise<Notice> {
  const { data } = await api.patch<{ data: Notice }>(
    `/api/projects/${projectId}/compliance/notices/${noticeId}`,
    input
  );
  return data;
}

export async function deleteNotice(
  projectId: string,
  noticeId: string
): Promise<void> {
  await api.delete(
    `/api/projects/${projectId}/compliance/notices/${noticeId}`
  );
}

export async function sendNotice(
  projectId: string,
  noticeId: string
): Promise<Notice> {
  const { data } = await api.post<{ data: Notice }>(
    `/api/projects/${projectId}/compliance/notices/${noticeId}/send`
  );
  return data;
}
