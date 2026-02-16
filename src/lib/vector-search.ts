import { getPool } from "@/lib/db";
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

// ─── Main Search Function (Hybrid: Vector + Keyword) ────────────────────────

export async function vectorSearch(
  query: string,
  options: SearchOptions
): Promise<ScoredResult[]> {
  const {
    projectId,
    scope,
    documentTypes,
    limit = 20,
    threshold = 0.15,
    activeProjectId,
  } = options;

  const pool = getPool();

  // Run vector search and keyword search in parallel
  const [vectorResults, keywordResults] = await Promise.all([
    runVectorSearch(pool, query, { projectId, scope, documentTypes, limit, threshold }),
    runKeywordSearch(pool, query, { projectId, scope, documentTypes, limit }),
  ]);

  // Merge results: deduplicate by chunkId, prefer vector similarity when available
  const merged = mergeResults(vectorResults, keywordResults);

  // Apply scoring
  return applyScoring(merged, scope, activeProjectId, query);
}

// ─── Vector Search ──────────────────────────────────────────────────────────

async function runVectorSearch(
  pool: ReturnType<typeof getPool>,
  query: string,
  opts: { projectId?: string; scope: string; documentTypes?: string[]; limit: number; threshold: number }
): Promise<RawResult[]> {
  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  let sql: string;
  const params: unknown[] = [embeddingStr, opts.threshold];

  if (opts.scope === "PROJECT" && opts.projectId) {
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
    params.push(opts.projectId);
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

  if (opts.documentTypes && opts.documentTypes.length > 0) {
    params.push(opts.documentTypes);
    sql += ` AND d.type = ANY($${params.length}::text[])`;
  }

  sql += ` ORDER BY dc.embedding <=> $1::vector LIMIT ${opts.limit}`;

  const result = await pool.query(sql, params);
  return result.rows as RawResult[];
}

// ─── Keyword Search ─────────────────────────────────────────────────────────

async function runKeywordSearch(
  pool: ReturnType<typeof getPool>,
  query: string,
  opts: { projectId?: string; scope: string; documentTypes?: string[]; limit: number }
): Promise<RawResult[]> {
  // Build search terms: use the full query as a phrase, plus individual words (3+ chars)
  const words = query.split(/\s+/).filter((w) => w.length >= 3);
  if (words.length === 0) return [];

  // Search for the full phrase first, then individual words
  const likePattern = `%${query.replace(/[%_]/g, "")}%`;

  let sql: string;
  const params: unknown[] = [likePattern];

  if (opts.scope === "PROJECT" && opts.projectId) {
    sql = `
      SELECT dc.id as "chunkId", dc.content, dc."pageNumber", dc."sectionRef", dc.metadata,
             d.id as "documentId", d.name as "documentName", d.type as "documentType",
             d."projectId", dc."createdAt",
             0.5 as similarity
      FROM "DocumentChunk" dc
      JOIN "Document" d ON dc."documentId" = d.id
      WHERE d."projectId" = $2
        AND d.status = 'READY'
        AND dc.content ILIKE $1
    `;
    params.push(opts.projectId);
  } else {
    sql = `
      SELECT dc.id as "chunkId", dc.content, dc."pageNumber", dc."sectionRef", dc.metadata,
             d.id as "documentId", d.name as "documentName", d.type as "documentType",
             d."projectId", p.name as "projectName", dc."createdAt",
             0.5 as similarity
      FROM "DocumentChunk" dc
      JOIN "Document" d ON dc."documentId" = d.id
      JOIN "Project" p ON d."projectId" = p.id
      WHERE d.status = 'READY'
        AND dc.content ILIKE $1
    `;
  }

  if (opts.documentTypes && opts.documentTypes.length > 0) {
    params.push(opts.documentTypes);
    sql += ` AND d.type = ANY($${params.length}::text[])`;
  }

  sql += ` LIMIT ${opts.limit}`;

  const result = await pool.query(sql, params);
  return result.rows as RawResult[];
}

// ─── Merge Results ──────────────────────────────────────────────────────────

function mergeResults(
  vectorResults: RawResult[],
  keywordResults: RawResult[]
): RawResult[] {
  const seen = new Map<string, RawResult>();

  // Vector results take priority (real similarity scores)
  for (const r of vectorResults) {
    seen.set(r.chunkId, r);
  }

  // Add keyword results that weren't found by vector search
  // Give keyword-only matches a base similarity of 0.5 (they contain the exact text)
  for (const r of keywordResults) {
    if (!seen.has(r.chunkId)) {
      seen.set(r.chunkId, r);
    }
  }

  return Array.from(seen.values());
}

// ─── Scoring Algorithm ──────────────────────────────────────────────────────

function applyScoring(
  results: RawResult[],
  scope: "PROJECT" | "CROSS_PROJECT",
  activeProjectId: string | undefined,
  query: string
): ScoredResult[] {
  const now = Date.now();
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length >= 3);

  const scored: ScoredResult[] = results.map((r) => {
    let baseScore = Number(r.similarity);

    // Keyword boost: if the chunk contains query terms, boost the score
    const contentLower = r.content.toLowerCase();
    const hasExactPhrase = contentLower.includes(queryLower);
    const matchingWords = queryWords.filter((w) => contentLower.includes(w));
    const wordMatchRatio = queryWords.length > 0 ? matchingWords.length / queryWords.length : 0;

    if (hasExactPhrase) {
      // Exact phrase match — strong boost
      baseScore = Math.max(baseScore, 0.70);
    } else if (wordMatchRatio >= 0.5) {
      // Partial word match — moderate boost
      baseScore = Math.max(baseScore, 0.40 + wordMatchRatio * 0.2);
    }

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
    const isMarginally = baseScore >= 0.15 && baseScore < 0.40;

    return { ...r, similarity: baseScore, finalScore, isMarginally };
  });

  // Diversity filtering
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
