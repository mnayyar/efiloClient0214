import { api } from "./client";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RFI {
  id: string;
  projectId: string;
  rfiNumber: string;
  subject: string;
  question: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  dueDate: string | null;
  submittedAt: string | null;
  respondedAt: string | null;
  response: string | null;
  aiDraftQuestion: string | null;
  aiDraftModel: string | null;
  aiResponseAnalysis: string | null;
  coFlag: boolean;
  coEstimate: number | null;
  isOverdue: boolean;
  sourceDocIds: string[];
  sourceChunkIds: string[];
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRFIInput {
  subject: string;
  question: string;
  priority?: string;
  assignedTo?: string;
  dueDate?: string;
  sourceDocIds?: string[];
}

export interface UpdateRFIInput {
  subject?: string;
  question?: string;
  status?: string;
  priority?: string;
  assignedTo?: string | null;
  dueDate?: string | null;
  response?: string | null;
  coFlag?: boolean;
  coEstimate?: number | null;
  sourceDocIds?: string[];
}

export interface DraftPreviewInput {
  subject: string;
  question: string;
  priority?: string;
  assignedTo?: string;
  sourceDocIds?: string[];
}

export interface DraftResult {
  draft: string;
  model: string;
  tokensUsed: { input: number; output: number };
}

export interface AnalysisResult {
  analysis: string;
  coDetected: boolean;
  model: string;
  tokensUsed: { input: number; output: number };
  rfi: RFI;
}

// ─── API Functions ──────────────────────────────────────────────────────────

export async function getRfis(projectId: string): Promise<RFI[]> {
  const { data } = await api.get<{ data: RFI[] }>(
    `/api/projects/${projectId}/rfis`
  );
  return data;
}

export async function getRfi(projectId: string, rfiId: string): Promise<RFI> {
  const { data } = await api.get<{ data: RFI }>(
    `/api/projects/${projectId}/rfis/${rfiId}`
  );
  return data;
}

export async function createRfi(
  projectId: string,
  input: CreateRFIInput
): Promise<RFI> {
  const { data } = await api.post<{ data: RFI }>(
    `/api/projects/${projectId}/rfis`,
    input
  );
  return data;
}

export async function updateRfi(
  projectId: string,
  rfiId: string,
  input: UpdateRFIInput
): Promise<RFI> {
  const { data } = await api.patch<{ data: RFI }>(
    `/api/projects/${projectId}/rfis/${rfiId}`,
    input
  );
  return data;
}

export async function deleteRfi(
  projectId: string,
  rfiId: string
): Promise<void> {
  await api.delete(`/api/projects/${projectId}/rfis/${rfiId}`);
}

export async function draftPreview(
  projectId: string,
  input: DraftPreviewInput
): Promise<DraftResult> {
  const { data } = await api.post<{ data: DraftResult }>(
    `/api/projects/${projectId}/rfis/draft-preview`,
    input
  );
  return data;
}

export async function generateAiDraft(
  projectId: string,
  rfiId: string
): Promise<DraftResult & { rfi: RFI }> {
  const { data } = await api.post<{ data: DraftResult & { rfi: RFI } }>(
    `/api/projects/${projectId}/rfis/${rfiId}/ai-draft`
  );
  return data;
}

export async function sendRfiEmail(
  projectId: string,
  rfiId: string
): Promise<{ success: boolean; rfi: RFI }> {
  const { data } = await api.post<{
    data: { success: boolean; rfi: RFI };
  }>(`/api/projects/${projectId}/rfis/${rfiId}/send-email`);
  return data;
}

export async function analyzeResponse(
  projectId: string,
  rfiId: string
): Promise<AnalysisResult> {
  const { data } = await api.post<{ data: AnalysisResult }>(
    `/api/projects/${projectId}/rfis/${rfiId}/analyze-response`
  );
  return data;
}

export async function checkRfiCompliance(
  projectId: string,
  rfiId: string
): Promise<{ deadlinesCreated: number; deadlineIds: string[] }> {
  const { data } = await api.post<{
    data: { deadlinesCreated: number; deadlineIds: string[] };
  }>(`/api/projects/${projectId}/rfis/${rfiId}/check-compliance`);
  return data;
}
