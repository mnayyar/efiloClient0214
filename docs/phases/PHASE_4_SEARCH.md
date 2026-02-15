# Phase 4: Vector Search Backend

## Goal
Implement the complete search pipeline: query classification, pgvector retrieval, scoring/re-ranking, and the search API endpoints. After this phase, the API can accept a natural language query and return ranked, relevant document chunks.

## Prompt for Claude Code

```
Implement the vector search backend for efilo.ai. Read CLAUDE.md, docs/SEARCH.md, and docs/AI_SERVICE.md for context. This builds on Phase 3 (document ingestion) and connects pgvector search with Claude Sonnet for query classification.

### Step 1: Vector Search (`lib/vector-search.ts`)

Implement the full vectorSearch function from docs/SEARCH.md. This was stubbed in Phase 1 — now implement it completely.

Key requirements:
- Execute pgvector cosine similarity query via prisma.$queryRawUnsafe
- Support PROJECT and CROSS_PROJECT scope
- Support document type filtering
- Return raw results with similarity scores

```typescript
// The query uses the pgvector <=> operator for cosine distance
// similarity = 1 - cosine_distance
// Threshold: 0.65 minimum, 0.72 for "confident" results
```

### Step 2: Scoring & Re-ranking (`services/search.ts`)

Create the search orchestration service that applies the scoring algorithm from docs/SEARCH.md:

```typescript
// services/search.ts

interface ScoredResult {
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
  similarity: number;       // Raw pgvector score
  finalScore: number;       // After all weights applied
  isMarginally: boolean;    // true if 0.65-0.72
}

export async function searchAndRank(query: string, options: {
  projectId?: string;
  scope: "PROJECT" | "CROSS_PROJECT";
  documentTypes?: string[];
  activeProjectId?: string;
}): Promise<ScoredResult[]> {
  // 1. Call vectorSearch() from lib/vector-search.ts
  // 2. Apply type weights from SEARCH.md
  // 3. Apply recency boost (within 30 days)
  // 4. Apply scope weight (1.2x for active project in cross-project)
  // 5. Apply diversity filter (max 3 chunks/document, max 1/sectionRef)
  // 6. Sort by finalScore descending
  // 7. Return top 10
}
```

### Step 3: Query Classification (`services/search.ts`)

Add query classification using Claude Sonnet:

```typescript
export async function classifyQuery(query: string, projectContext: {
  projectId: string;
  projectName: string;
}): Promise<{
  scope: "PROJECT" | "CROSS_PROJECT";
  intent: "factual_lookup" | "comparison" | "analysis" | "action_request" | "definition";
  documentTypes: string[];
  confidence: number;
}> {
  const response = await generateResponse({
    model: "sonnet",
    maxTokens: 500,
    temperature: 0.1,
    systemPrompt: QUERY_CLASSIFICATION_PROMPT,  // From the Cap1 spec section 5.1
    userPrompt: `Query: "${query}"\nCurrent project: ${projectContext.projectName} (${projectContext.projectId})`,
  });
  
  return JSON.parse(response.content);
}
```

Use the full query classification system prompt from the Cap1 v2.0 spec (Section 5.1). Include all classification rules, scope detection, intent detection, and document type filtering logic.

### Step 4: Search API Endpoint

**GET /api/projects/[projectId]/search**

```typescript
// src/app/api/projects/[projectId]/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { searchAndRank } from "@/services/search";

const searchParamsSchema = z.object({
  q: z.string().min(3),
  scope: z.enum(["PROJECT", "CROSS_PROJECT"]).default("PROJECT"),
  types: z.string().optional(),  // comma-separated
  limit: z.coerce.number().min(1).max(50).default(10),
  offset: z.coerce.number().min(0).default(0),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const user = await requireAuth(request);
  
  // Parse and validate query params
  const searchParams = Object.fromEntries(request.nextUrl.searchParams);
  const validated = searchParamsSchema.parse(searchParams);
  
  // Parse document types
  const documentTypes = validated.types?.split(",").filter(Boolean);
  
  // Execute search
  const results = await searchAndRank(validated.q, {
    projectId: params.projectId,
    scope: validated.scope,
    documentTypes,
    activeProjectId: params.projectId,
  });
  
  // Format response per Cap1 spec section 6.2
  return NextResponse.json({
    query: validated.q,
    scope: validated.scope,
    filters: { documentTypes },
    results: groupByDocument(results),  // Group chunks by document
    pagination: {
      offset: validated.offset,
      limit: validated.limit,
      total: results.length,
      hasMore: false,
    },
    searchTime: /* measured */,
    totalChunks: results.length,
  });
}
```

### Step 5: Cross-Project Search Endpoint

**POST /api/search/cross-project**

```typescript
// src/app/api/search/cross-project/route.ts
// Similar to project search but:
// - No projectId filter in pgvector query
// - Results grouped by projectId
// - Active project gets 1.2x boost
// See Cap1 spec section 6.3 for full schema
```

### Step 6: Search Analytics Logging

After each search, create a SearchAnalytics record:

```typescript
await prisma.searchAnalytics.create({
  data: {
    userId: user.id,
    searchTerm: query,
    scope,
    resultCount: results.length,
    queryId: searchQuery.id,
  },
});
```

Also log to AuditLog for compliance:

```typescript
await prisma.auditLog.create({
  data: {
    userId: user.id,
    action: "SEARCH",
    entityType: "SearchQuery",
    entityId: searchQuery.id,
    projectId,
    details: { query, scope, resultCount: results.length },
  },
});
```

### Step 7: Verify

Test with real data:
1. Upload 2-3 documents via Phase 3 pipeline
2. Wait for ingestion to complete (READY status)
3. Hit GET /api/projects/{id}/search?q=test+query
4. Verify results come back with similarity scores
5. Test type filtering: ?types=SPEC,ADDENDUM
6. Test cross-project: POST /api/search/cross-project

Test scoring:
- Verify ADDENDUM results score higher than MEETING results (type weight)
- Verify same-project results boost in cross-project mode
- Verify max 3 chunks per document in results

Edge cases:
- Empty query → 400 error
- Query with no results → empty results array (not error)
- Query with only marginal results (0.65-0.72) → results with isMarginally flag
```

## Success Criteria
- [ ] pgvector query returns results with similarity scores
- [ ] Type weights applied correctly
- [ ] Recency boost applied for recent documents
- [ ] Cross-project search works without projectId filter
- [ ] Diversity filter limits chunks per document
- [ ] Query classification returns correct scope and intent
- [ ] Search API returns formatted response per spec
- [ ] Analytics logged for each search
