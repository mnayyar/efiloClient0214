import { prisma } from "@/lib/db";
import { generateResponse } from "@/lib/ai";
import { vectorSearch, type ScoredResult } from "@/lib/vector-search";
import type { Prisma } from "@prisma/client";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SearchRequest {
  query: string;
  projectId: string;
  scope?: "PROJECT" | "CROSS_PROJECT";
  documentTypes?: string[];
  activeProjectId?: string;
}

interface QueryClassification {
  scope: "PROJECT" | "CROSS_PROJECT";
  intent:
    | "factual_lookup"
    | "comparison"
    | "analysis"
    | "action_request"
    | "definition";
  documentTypes: string[];
  confidence: number;
}

interface GroupedResult {
  documentId: string;
  documentName: string;
  documentType: string;
  projectId: string;
  projectName?: string;
  chunks: {
    chunkId: string;
    content: string;
    pageNumber: number | null;
    sectionRef: string | null;
    similarity: number;
    finalScore: number;
    isMarginally: boolean;
  }[];
}

interface SearchResponse {
  query: string;
  scope: "PROJECT" | "CROSS_PROJECT";
  classification: QueryClassification | null;
  filters: { documentTypes?: string[] };
  results: GroupedResult[];
  totalChunks: number;
  searchTimeMs: number;
}

interface Source {
  index: number;
  documentId: string;
  documentName: string;
  documentType: string;
  pageNumber: number | null;
  sectionRef: string | null;
  chunkId: string;
}

interface Alert {
  type: "conflict" | "version_mismatch" | "superseded";
  message: string;
  sourceIndices: number[];
}

interface SuggestedPrompt {
  text: string;
  category: string;
}

interface ChatResponse {
  response: string;
  sources: Source[];
  scope: "PROJECT" | "CROSS_PROJECT";
  searchTimeMs: number;
  confidence: number;
  suggestedPrompts: SuggestedPrompt[];
  alerts: Alert[];
  tokensUsed: { input: number; output: number };
}

// ─── Query Classification ───────────────────────────────────────────────────

const QUERY_CLASSIFICATION_PROMPT = `You are a search query classifier for a construction project management system. Analyze the user's query and return a JSON object with the following fields:

1. "scope": Either "PROJECT" (query is about the current project) or "CROSS_PROJECT" (query references multiple projects or general knowledge).
   - Default to "PROJECT" unless the query explicitly mentions other projects, comparisons across projects, or portfolio-level topics.

2. "intent": One of:
   - "factual_lookup" — Asking for a specific fact, spec reference, or contract detail.
   - "comparison" — Comparing two things (versions, specs, projects, approaches).
   - "analysis" — Asking for interpretation, implications, risk assessment.
   - "action_request" — Asking what to do, next steps, or requesting a draft.
   - "definition" — Asking what something means or how something works.

3. "documentTypes": Array of relevant document types to filter. Choose from: SPEC, DRAWING, ADDENDUM, RFI, CONTRACT, CHANGE, COMPLIANCE, MEETING, FINANCIAL, SCHEDULE, CLOSEOUT, PORTFOLIO. Return an empty array if no specific type filter is appropriate.

4. "confidence": A number 0.0-1.0 indicating how confident you are in this classification.

Return ONLY valid JSON, no explanation.`;

export async function classifyQuery(
  query: string,
  projectContext: { projectId: string; projectName: string }
): Promise<QueryClassification> {
  try {
    const response = await generateResponse({
      model: "sonnet",
      maxTokens: 500,
      temperature: 0.1,
      systemPrompt: QUERY_CLASSIFICATION_PROMPT,
      userPrompt: `Query: "${query}"\nCurrent project: ${projectContext.projectName} (${projectContext.projectId})`,
    });

    return JSON.parse(response.content);
  } catch {
    return {
      scope: "PROJECT",
      intent: "factual_lookup",
      documentTypes: [],
      confidence: 0.0,
    };
  }
}

// ─── Search & Rank ──────────────────────────────────────────────────────────

export async function searchAndRank(
  request: SearchRequest
): Promise<{ results: ScoredResult[]; searchResponse: SearchResponse }> {
  const start = Date.now();
  const {
    query,
    projectId,
    scope = "PROJECT",
    documentTypes,
    activeProjectId,
  } = request;

  const results = await vectorSearch(query, {
    projectId: scope === "PROJECT" ? projectId : undefined,
    scope,
    documentTypes,
    activeProjectId: activeProjectId ?? projectId,
    limit: 20,
    threshold: 0.65,
  });

  const grouped = groupByDocument(results);
  const searchTimeMs = Date.now() - start;

  return {
    results,
    searchResponse: {
      query,
      scope,
      classification: null,
      filters: { documentTypes },
      results: grouped,
      totalChunks: results.length,
      searchTimeMs,
    },
  };
}

// ─── Answer Generation ──────────────────────────────────────────────────────

const ANSWER_GENERATION_PROMPT = `You are an AI assistant for construction project managers using efilo.ai. Generate precise, cited answers based on retrieved construction documents.

CITATION FORMAT:
- Use inline citations: [Source N] where N is the source number.
- Every factual claim MUST have a citation.
- If multiple sources support a claim, cite all: [Source 1, Source 3].

CONFLICT DETECTION:
- If sources contradict each other, flag it explicitly with "⚠️ CONFLICT:" followed by the contradiction.
- If an Addendum supersedes a Spec, note: "Note: Addendum [Source N] supersedes [Source M]."
- If a Drawing conflicts with a Spec, flag it.

RESPONSE STRUCTURE:
1. Direct answer to the query (1-2 paragraphs max)
2. Key details with citations
3. Any conflicts or alerts (if applicable)

RULES:
- Be concise and specific — construction professionals need facts, not fluff.
- If the retrieved documents don't contain enough information, say so clearly.
- Never fabricate information not in the sources.
- Use construction industry terminology appropriately.
- Format with markdown for readability (headers, bullet points, bold for key terms).

Return your answer in markdown format.`;

export async function generateSearchAnswer(
  query: string,
  chunks: ScoredResult[],
  context: {
    projectName: string;
    scope: "PROJECT" | "CROSS_PROJECT";
    userRole?: string;
  }
): Promise<{
  response: string;
  sources: Source[];
  confidence: number;
  alerts: Alert[];
  tokensUsed: { input: number; output: number };
}> {
  if (chunks.length === 0) {
    return {
      response:
        "No relevant documents were found for your query. Try broadening your search terms or adjusting the document type filters.",
      sources: [],
      confidence: 0,
      alerts: [],
      tokensUsed: { input: 0, output: 0 },
    };
  }

  // Build sources list
  const sources: Source[] = chunks.map((c, i) => ({
    index: i + 1,
    documentId: c.documentId,
    documentName: c.documentName,
    documentType: c.documentType,
    pageNumber: c.pageNumber,
    sectionRef: c.sectionRef,
    chunkId: c.chunkId,
  }));

  // Format chunks as context
  const chunksContext = chunks
    .map(
      (c, i) =>
        `[Source ${i + 1}: ${c.documentName} (${c.documentType})${c.pageNumber ? `, p.${c.pageNumber}` : ""}${c.sectionRef ? `, §${c.sectionRef}` : ""}]\n${c.content}`
    )
    .join("\n\n---\n\n");

  const answerResponse = await generateResponse({
    model: "sonnet",
    maxTokens: 1500,
    temperature: 0.3,
    systemPrompt: ANSWER_GENERATION_PROMPT,
    userPrompt: `Query: "${query}"\n\nProject: ${context.projectName}\nScope: ${context.scope}\nUser Role: ${context.userRole ?? "project_manager"}\n\nRetrieved Documents:\n${chunksContext}`,
  });

  // Detect alerts from response content
  const alerts = detectAlerts(answerResponse.content, chunks);

  return {
    response: answerResponse.content,
    sources,
    confidence: calculateConfidence(chunks),
    alerts,
    tokensUsed: answerResponse.tokensUsed,
  };
}

function calculateConfidence(chunks: ScoredResult[]): number {
  if (chunks.length === 0) return 0;
  const avgSimilarity =
    chunks.reduce((sum, c) => sum + Number(c.similarity), 0) / chunks.length;
  const hasStrongResults = chunks.some((c) => Number(c.similarity) >= 0.72);
  // Confidence: weighted avg similarity + bonus for strong matches
  return Math.min(1, avgSimilarity + (hasStrongResults ? 0.1 : 0));
}

function detectAlerts(response: string, chunks: ScoredResult[]): Alert[] {
  const alerts: Alert[] = [];

  // Detect conflicts flagged by Claude in the response
  if (response.includes("CONFLICT:") || response.includes("⚠️")) {
    alerts.push({
      type: "conflict",
      message: "Potential conflicts detected between sources. Review highlighted sections.",
      sourceIndices: chunks.map((_, i) => i + 1),
    });
  }

  // Detect addendum supersession
  const hasAddendum = chunks.some((c) => c.documentType === "ADDENDUM");
  const hasSpec = chunks.some((c) => c.documentType === "SPEC");
  if (hasAddendum && hasSpec) {
    const addendumIndices = chunks
      .map((c, i) => (c.documentType === "ADDENDUM" ? i + 1 : -1))
      .filter((i) => i > 0);
    alerts.push({
      type: "superseded",
      message: "Addendum found — may supersede earlier specification sections.",
      sourceIndices: addendumIndices,
    });
  }

  return alerts;
}

// ─── Suggested Prompts ──────────────────────────────────────────────────────

const SUGGESTED_PROMPTS_PROMPT = `You are a construction project assistant. Based on the user's last query and the types of documents retrieved, suggest 3 follow-up questions they might want to ask.

Rules:
- Make suggestions specific and actionable.
- Vary the categories: one factual, one analytical, one action-oriented.
- Keep each suggestion under 80 characters.
- Return a JSON array of objects with "text" and "category" fields.
- Categories: "factual", "analysis", "action", "comparison"

Return ONLY valid JSON array, no explanation.`;

export async function generateSuggestedPrompts(
  query: string,
  chunks: ScoredResult[],
  context: { projectName: string; scope: string; userRole?: string }
): Promise<SuggestedPrompt[]> {
  try {
    const docTypes = [...new Set(chunks.map((c) => c.documentType))].join(", ");
    const response = await generateResponse({
      model: "sonnet",
      maxTokens: 1000,
      temperature: 0.5,
      systemPrompt: SUGGESTED_PROMPTS_PROMPT,
      userPrompt: `Last query: "${query}"\nRetrieved doc types: ${docTypes}\nScope: ${context.scope}\nProject: ${context.projectName}\nUser role: ${context.userRole ?? "project_manager"}`,
    });

    return JSON.parse(response.content);
  } catch {
    return [
      { text: "What are the key deadlines for this project?", category: "factual" },
      { text: "Are there any compliance risks I should know about?", category: "analysis" },
      { text: "What should I prioritize this week?", category: "action" },
    ];
  }
}

// ─── Full Search + Answer Orchestration ─────────────────────────────────────

export async function executeSearch(
  query: string,
  options: {
    projectId: string;
    projectName: string;
    userId: string;
    userRole?: string;
    sessionId?: string;
    documentTypes?: string[];
  }
): Promise<ChatResponse> {
  const start = Date.now();

  // 1. Classify query
  const classification = await classifyQuery(query, {
    projectId: options.projectId,
    projectName: options.projectName,
  });

  // 2. Merge user-specified types with classified types
  const docTypes =
    options.documentTypes && options.documentTypes.length > 0
      ? options.documentTypes
      : classification.documentTypes.length > 0
        ? classification.documentTypes
        : undefined;

  // 3. Search & rank
  const { results: chunks } = await searchAndRank({
    query,
    projectId: options.projectId,
    scope: classification.scope,
    documentTypes: docTypes,
    activeProjectId: options.projectId,
  });

  // 4. Generate cited answer
  const answer = await generateSearchAnswer(query, chunks, {
    projectName: options.projectName,
    scope: classification.scope,
    userRole: options.userRole,
  });

  // 5. Generate suggested follow-ups
  const suggestedPrompts = await generateSuggestedPrompts(query, chunks, {
    projectName: options.projectName,
    scope: classification.scope,
    userRole: options.userRole,
  });

  const searchTimeMs = Date.now() - start;
  const totalTokens = answer.tokensUsed.input + answer.tokensUsed.output;

  // 6. Log search
  await prisma.searchQuery.create({
    data: {
      userId: options.userId,
      projectId: options.projectId,
      query,
      scope: classification.scope,
      documentTypes: docTypes ?? [],
      response: answer.response,
      sources: answer.sources as unknown as Prisma.InputJsonValue,
      responseTime: searchTimeMs,
      tokenCount: totalTokens,
    },
  });

  return {
    response: answer.response,
    sources: answer.sources,
    scope: classification.scope,
    searchTimeMs,
    confidence: answer.confidence,
    suggestedPrompts,
    alerts: answer.alerts,
    tokensUsed: answer.tokensUsed,
  };
}

// ─── Group By Document ──────────────────────────────────────────────────────

function groupByDocument(results: ScoredResult[]): GroupedResult[] {
  const groups = new Map<string, GroupedResult>();

  for (const r of results) {
    let group = groups.get(r.documentId);
    if (!group) {
      group = {
        documentId: r.documentId,
        documentName: r.documentName,
        documentType: r.documentType,
        projectId: r.projectId,
        projectName: r.projectName,
        chunks: [],
      };
      groups.set(r.documentId, group);
    }

    group.chunks.push({
      chunkId: r.chunkId,
      content: r.content,
      pageNumber: r.pageNumber,
      sectionRef: r.sectionRef,
      similarity: Number(r.similarity),
      finalScore: r.finalScore,
      isMarginally: r.isMarginally,
    });
  }

  return Array.from(groups.values()).sort(
    (a, b) =>
      Math.max(...b.chunks.map((c) => c.finalScore)) -
      Math.max(...a.chunks.map((c) => c.finalScore))
  );
}

// ─── Search Analytics Logging ───────────────────────────────────────────────

export async function logSearchAnalytics(params: {
  userId: string;
  query: string;
  scope: "PROJECT" | "CROSS_PROJECT";
  projectId?: string;
  resultCount: number;
  searchTimeMs: number;
  tokenCount?: number;
}) {
  const {
    userId,
    query,
    scope,
    projectId,
    resultCount,
    searchTimeMs,
    tokenCount,
  } = params;

  const searchQuery = await prisma.searchQuery.create({
    data: {
      userId,
      projectId,
      query,
      scope,
      responseTime: searchTimeMs,
      tokenCount,
    },
  });

  await prisma.searchAnalytics.create({
    data: {
      queryId: searchQuery.id,
      userId,
      searchTerm: query,
      scope,
      resultCount,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: "SEARCH",
      entityType: "SearchQuery",
      entityId: searchQuery.id,
      projectId,
      details: { query, scope, resultCount, searchTimeMs },
    },
  });

  return searchQuery.id;
}

export type {
  SearchRequest,
  SearchResponse,
  QueryClassification,
  GroupedResult,
  ChatResponse,
  Source,
  Alert,
  SuggestedPrompt,
};
