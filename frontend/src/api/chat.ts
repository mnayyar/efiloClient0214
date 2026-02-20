import { api } from "./client";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ChatSession {
  id: string;
  title: string | null;
  projectId: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  project?: { id: string; name: string } | null;
}

export interface ChatSessionDetail extends ChatSession {
  messages: ChatMessage[];
}

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  webCitations?: WebCitation[];
  confidence?: number;
  alerts?: Alert[];
  suggestedPrompts?: SuggestedPrompt[];
  scope?: "PROJECT" | "CROSS_PROJECT" | "WORLD";
  timestamp?: string;
}

export interface Source {
  index: number;
  documentId: string;
  documentName: string;
  documentType: string;
  pageNumber: number | null;
  sectionRef: string | null;
  chunkId: string;
}

export interface Alert {
  type: "conflict" | "version_mismatch" | "superseded";
  message: string;
  sourceIndices: number[];
}

export interface SuggestedPrompt {
  text: string;
  category: string;
}

export interface WebCitation {
  url: string;
  title: string;
}

export interface SearchSuggestions {
  suggestions: SuggestedPrompt[];
  documentStats: { type: string; count: number }[];
}

// ─── API Functions ──────────────────────────────────────────────────────────

export async function getSessions(projectId?: string): Promise<ChatSession[]> {
  const params = projectId ? `?project_id=${projectId}` : "";
  const { data } = await api.get<{ data: ChatSession[] }>(
    `/api/chat/sessions${params}`
  );
  return data;
}

export async function getSession(sessionId: string): Promise<ChatSessionDetail> {
  const { data } = await api.get<{ data: ChatSessionDetail }>(
    `/api/chat/sessions/${sessionId}`
  );
  return data;
}

export async function archiveSession(sessionId: string): Promise<void> {
  await api.delete(`/api/chat/sessions/${sessionId}`);
}

export async function getSearchSuggestions(
  projectId: string
): Promise<SearchSuggestions> {
  const { data } = await api.get<{ data: SearchSuggestions }>(
    `/api/projects/${projectId}/search/suggestions`
  );
  return data;
}
