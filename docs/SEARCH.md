# Search Scoring & Ranking — efilo.ai

## Overview

Universal Search uses a multi-stage pipeline:
1. **Classify** — Determine scope, intent, document type filters (Claude Sonnet)
2. **Embed** — Generate query embedding (OpenAI text-embedding-3-large, 1536d)
3. **Retrieve** — pgvector cosine similarity search (SQL)
4. **Score & Rank** — Apply type weights, recency, scope boosts
5. **Generate** — Synthesize cited answer (Claude Sonnet)
6. **Suggest** — Generate follow-up prompts (Claude Sonnet)

## pgvector Query Pattern

```sql
-- Project-scoped search
SELECT 
  dc.id,
  dc.content,
  dc."pageNumber",
  dc."sectionRef",
  dc.metadata,
  d.id as "documentId",
  d.name as "documentName",
  d.type as "documentType",
  d."projectId",
  1 - (dc.embedding <=> $1::vector) as similarity
FROM "DocumentChunk" dc
JOIN "Document" d ON dc."documentId" = d.id
WHERE d."projectId" = $2
  AND d.status = 'READY'
  AND 1 - (dc.embedding <=> $1::vector) > 0.65
ORDER BY dc.embedding <=> $1::vector
LIMIT 20;

-- Cross-project search (omit projectId filter)
SELECT 
  dc.id, dc.content, dc."pageNumber", dc."sectionRef", dc.metadata,
  d.id as "documentId", d.name as "documentName", d.type as "documentType",
  d."projectId", p.name as "projectName", p.status as "projectStatus",
  1 - (dc.embedding <=> $1::vector) as similarity
FROM "DocumentChunk" dc
JOIN "Document" d ON dc."documentId" = d.id
JOIN "Project" p ON d."projectId" = p.id
WHERE d.status = 'READY'
  AND 1 - (dc.embedding <=> $1::vector) > 0.65
ORDER BY dc.embedding <=> $1::vector
LIMIT 30;

-- With document type filter
... AND d.type = ANY($3::text[])
```

## Scoring Algorithm

### 1. Base Score (pgvector)
```
base_score = 1 - cosine_distance(query_embedding, chunk_embedding)
// Range: 0.0 to 1.0
```

### 2. Document Type Weights
```typescript
const TYPE_WEIGHTS: Record<DocumentType, number> = {
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
```

### 3. Recency Boost (within 30 days)
```typescript
const daysOld = daysSince(chunk.createdAt);
const recencyBoost = daysOld > 30 ? 1.0 : 1.05 - (daysOld / 30) * 0.05;
// Range: 1.0 to 1.05
```

### 4. Scope Weight (cross-project only)
```typescript
const scopeWeight = (scope === "CROSS_PROJECT" && chunk.projectId === activeProjectId) ? 1.2 : 1.0;
```

### 5. Final Score
```typescript
const finalScore = baseScore * typeWeight * recencyBoost * scopeWeight;
```

## Similarity Thresholds

| Threshold | Behavior |
|-----------|----------|
| >= 0.72 | Include in results; full citation |
| 0.65-0.72 | Include with "marginally relevant" flag |
| < 0.65 | Exclude from results |

## Diversity Filtering

After scoring, apply diversity filters:
- Max 3 chunks per document
- Max 1 chunk per section reference
- Return top 10 chunks

## Implementation (`lib/vector-search.ts`)

```typescript
import { prisma } from "@/lib/db";
import { generateEmbedding } from "@/lib/embeddings";
import { Prisma } from "@prisma/client";

interface SearchOptions {
  projectId?: string;
  scope: "PROJECT" | "CROSS_PROJECT";
  documentTypes?: string[];
  limit?: number;
  threshold?: number;
}

interface SearchResult {
  chunkId: string;
  content: string;
  pageNumber: number | null;
  sectionRef: string | null;
  metadata: any;
  documentId: string;
  documentName: string;
  documentType: string;
  projectId: string;
  projectName?: string;
  similarity: number;
  finalScore: number;
}

export async function vectorSearch(
  query: string,
  options: SearchOptions
): Promise<SearchResult[]> {
  const { projectId, scope, documentTypes, limit = 20, threshold = 0.65 } = options;

  // 1. Generate query embedding
  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  // 2. Build pgvector query
  let sql: string;
  const params: any[] = [embeddingStr, threshold];

  if (scope === "PROJECT" && projectId) {
    sql = `
      SELECT dc.id as "chunkId", dc.content, dc."pageNumber", dc."sectionRef", dc.metadata,
             d.id as "documentId", d.name as "documentName", d.type as "documentType",
             d."projectId",
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
             d."projectId", p.name as "projectName",
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

  // 3. Execute
  const rawResults = await prisma.$queryRawUnsafe(sql, ...params);

  // 4. Score & rank (see scoring algorithm above)
  // 5. Diversity filter
  // 6. Return top results

  return applyScoring(rawResults as any[], projectId);
}
```
