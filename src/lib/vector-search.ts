import { prisma } from "@/lib/db";
import { generateEmbedding } from "@/lib/embeddings";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SearchOptions {
  projectId?: string;
  scope: "PROJECT" | "CROSS_PROJECT";
  documentTypes?: string[];
  limit?: number;
  threshold?: number;
  activeProjectId?: string;
}

interface RawResult {
  chunkId: string;
  content: string;
  pageNumber: number | null;
  sectionRef: string | null;
  metadata: unknown;
  documentId: string;
  documentName: string;
  documentType: string;
  projectId: string;
  projectName?: string;
  similarity: number;
  createdAt: Date;
}

interface ScoredResult extends RawResult {
  finalScore: number;
  isMarginally: boolean;
}

// ─── Document Type Weights (from docs/SEARCH.md) ───────────────────────────

const TYPE_WEIGHTS: Record<string, number> = {
  SPEC: 1.3,
  DRAWING: 1.25,
  ADDENDUM: 1.4,
  RFI: 1.1,
  CONTRACT: 1.2,
  CHANGE: 1.35,
  COMPLIANCE: 1.15,
  MEETING: 0.9,
  FINANCIAL: 1.25,
  SCHEDULE: 1.15,
  CLOSEOUT: 0.8,
  PORTFOLIO: 1.0,
};

// ─── Main Search Function ───────────────────────────────────────────────────

export async function vectorSearch(
  query: string,
  options: SearchOptions
): Promise<ScoredResult[]> {
  const {
    projectId,
    scope,
    documentTypes,
    limit = 20,
    threshold = 0.35,
    activeProjectId,
  } = options;

  // 1. Generate query embedding
  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  // 2. Build pgvector query
  let sql: string;
  const params: unknown[] = [embeddingStr, threshold];

  if (scope === "PROJECT" && projectId) {
    sql = `
      SELECT dc.id as "chunkId", dc.content, dc."pageNumber", dc."sectionRef", dc.metadata,
             d.id as "documentId", d.name as "documentName", d.type as "documentType",
             d."projectId", dc."createdAt",
             1 - (dc.embedding <=> $1::vector) as similarity
      FROM "DocumentChunk" dc
      JOIN "Document" d ON dc."documentId" = d.id
      WHERE d."projectId" = $3
        AND d.status = 'READY'
        AND 1 - (dc.embedding <=> $1::vector) > $2
    `;
    params.push(projectId);
  } else {
    sql = `
      SELECT dc.id as "chunkId", dc.content, dc."pageNumber", dc."sectionRef", dc.metadata,
             d.id as "documentId", d.name as "documentName", d.type as "documentType",
             d."projectId", p.name as "projectName", dc."createdAt",
             1 - (dc.embedding <=> $1::vector) as similarity
      FROM "DocumentChunk" dc
      JOIN "Document" d ON dc."documentId" = d.id
      JOIN "Project" p ON d."projectId" = p.id
      WHERE d.status = 'READY'
        AND 1 - (dc.embedding <=> $1::vector) > $2
    `;
  }

  // Document type filter
  if (documentTypes && documentTypes.length > 0) {
    params.push(documentTypes);
    sql += ` AND d.type = ANY($${params.length}::text[])`;
  }

  sql += ` ORDER BY dc.embedding <=> $1::vector LIMIT ${limit}`;

  // 3. Execute query
  const rawResults = (await prisma.$queryRawUnsafe(
    sql,
    ...params
  )) as RawResult[];

  // 4. Apply scoring
  return applyScoring(rawResults, scope, activeProjectId);
}

// ─── Scoring Algorithm ──────────────────────────────────────────────────────

function applyScoring(
  results: RawResult[],
  scope: "PROJECT" | "CROSS_PROJECT",
  activeProjectId?: string
): ScoredResult[] {
  const now = Date.now();

  const scored: ScoredResult[] = results.map((r) => {
    const baseScore = Number(r.similarity);

    // Type weight
    const typeWeight = TYPE_WEIGHTS[r.documentType] ?? 1.0;

    // Recency boost (within 30 days)
    const daysOld = (now - new Date(r.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    const recencyBoost = daysOld > 30 ? 1.0 : 1.05 - (daysOld / 30) * 0.05;

    // Scope weight (cross-project: active project gets 1.2x)
    const scopeWeight =
      scope === "CROSS_PROJECT" && activeProjectId && r.projectId === activeProjectId
        ? 1.2
        : 1.0;

    const finalScore = baseScore * typeWeight * recencyBoost * scopeWeight;
    const isMarginally = baseScore >= 0.35 && baseScore < 0.50;

    return { ...r, finalScore, isMarginally };
  });

  // 5. Diversity filtering
  return applyDiversityFilter(scored);
}

// ─── Diversity Filter ───────────────────────────────────────────────────────

function applyDiversityFilter(results: ScoredResult[]): ScoredResult[] {
  // Sort by finalScore descending
  results.sort((a, b) => b.finalScore - a.finalScore);

  const docCounts = new Map<string, number>();
  const sectionSeen = new Set<string>();
  const filtered: ScoredResult[] = [];

  for (const result of results) {
    // Max 3 chunks per document
    const docCount = docCounts.get(result.documentId) ?? 0;
    if (docCount >= 3) continue;

    // Max 1 chunk per section reference
    if (result.sectionRef) {
      const sectionKey = `${result.documentId}:${result.sectionRef}`;
      if (sectionSeen.has(sectionKey)) continue;
      sectionSeen.add(sectionKey);
    }

    docCounts.set(result.documentId, docCount + 1);
    filtered.push(result);

    // Return top 10
    if (filtered.length >= 10) break;
  }

  return filtered;
}

export type { SearchOptions, RawResult, ScoredResult };
