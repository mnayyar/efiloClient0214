# Phase 5: Chat & AI Answer Generation

## Goal
Implement the full chat pipeline: classify query → search → generate cited answer → suggest follow-ups. Wire up session management, streaming responses via SSE, and the chat API. After this phase, users can have multi-turn conversations with AI-generated answers citing specific documents.

## Prompt for Claude Code

```
Implement the chat and AI answer generation layer for efilo.ai. Read CLAUDE.md, docs/AI_SERVICE.md, and docs/SEARCH.md. This builds on Phase 4 (search backend) and adds Claude Sonnet for answer synthesis with citations.

### Step 1: Answer Generation Service (`services/search.ts`)

Add the answer generation function that takes search results and generates a cited response via Claude Sonnet:

```typescript
export async function generateSearchAnswer(query: string, chunks: ScoredResult[], context: {
  projectName: string;
  scope: "PROJECT" | "CROSS_PROJECT";
  userRole?: string;
}): Promise<{
  response: string;         // Markdown with inline citations
  sources: Source[];         // Structured source list
  confidence: number;        // 0.0-1.0
  alerts: Alert[];           // Conflicts, version mismatches
  suggestedPrompts: SuggestedPrompt[];
  tokensUsed: { input: number; output: number };
}> {
  // Format chunks as context for Claude
  const chunksContext = chunks.map((c, i) => 
    `[Source ${i + 1}: ${c.documentName} (${c.documentType}), p.${c.pageNumber}, §${c.sectionRef}]\n${c.content}`
  ).join("\n\n---\n\n");

  // Generate answer with citations
  const answerResponse = await generateResponse({
    model: "sonnet",
    maxTokens: 1500,
    temperature: 0.3,
    systemPrompt: ANSWER_GENERATION_PROMPT,  // Full prompt from Cap1 spec section 5.2
    userPrompt: `Query: "${query}"\n\nProject: ${context.projectName}\nScope: ${context.scope}\n\nRetrieved Documents:\n${chunksContext}`,
  });

  // Parse response to extract sources, alerts
  const parsed = parseAnswerResponse(answerResponse.content, chunks);

  // Generate suggested follow-up prompts
  const suggestedPrompts = await generateSuggestedPrompts(query, chunks, context);

  return {
    response: parsed.response,
    sources: parsed.sources,
    confidence: calculateConfidence(chunks),
    alerts: parsed.alerts,
    suggestedPrompts,
    tokensUsed: answerResponse.tokensUsed,
  };
}
```

Use the FULL answer generation system prompt from Cap1 v2.0 spec section 5.2, including all citation format rules, conflict detection, addendum supersession, scope badges, and the quality checklist.

### Step 2: Suggested Prompts Generation

```typescript
export async function generateSuggestedPrompts(
  query: string,
  chunks: ScoredResult[],
  context: { projectName: string; scope: string; userRole?: string }
): Promise<SuggestedPrompt[]> {
  const response = await generateResponse({
    model: "sonnet",
    maxTokens: 1000,
    temperature: 0.5,
    systemPrompt: SUGGESTED_PROMPTS_PROMPT,  // From Cap1 spec section 5.4
    userPrompt: `Last query: "${query}"\nRetrieved doc types: ${[...new Set(chunks.map(c => c.documentType))].join(", ")}\nScope: ${context.scope}\nProject: ${context.projectName}\nUser role: ${context.userRole ?? "pm"}`,
  });

  return JSON.parse(response.content);
}
```

### Step 3: Full Search Orchestration

Create the main orchestration function that chains everything:

```typescript
export async function executeSearch(query: string, options: {
  projectId: string;
  projectName: string;
  userId: string;
  userRole?: string;
  sessionId?: string;
  documentTypes?: string[];
}): Promise<ChatResponse> {
  const start = Date.now();

  // 1. Classify query (scope, intent, types)
  const classification = await classifyQuery(query, {
    projectId: options.projectId,
    projectName: options.projectName,
  });

  // 2. Merge user-specified types with classified types
  const docTypes = options.documentTypes?.length
    ? options.documentTypes
    : classification.documentTypes;

  // 3. Search & rank
  const chunks = await searchAndRank(query, {
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

  // 5. Log search query
  const searchQuery = await prisma.searchQuery.create({
    data: {
      userId: options.userId,
      projectId: options.projectId,
      query,
      scope: classification.scope,
      documentTypes: docTypes,
      response: answer.response,
      sources: answer.sources,
      responseTime: Date.now() - start,
      tokenCount: answer.tokensUsed.input + answer.tokensUsed.output,
    },
  });

  return {
    response: answer.response,
    sources: answer.sources,
    scope: classification.scope,
    searchTime: Date.now() - start,
    confidence: answer.confidence,
    suggestedPrompts: answer.suggestedPrompts,
    alerts: answer.alerts,
  };
}
```

### Step 4: Chat Session Management

**POST /api/chat** — Main chat endpoint (from Cap1 spec section 6.1)

```typescript
// src/app/api/chat/route.ts
export async function POST(request: NextRequest) {
  const user = await requireAuth(request);
  const body = await request.json();
  
  // Validate
  const { query, sessionId, projectId, documentTypes, userRole } = chatRequestSchema.parse(body);
  
  // Get or create session
  let session: ChatSession;
  if (sessionId) {
    session = await prisma.chatSession.findUniqueOrThrow({ where: { id: sessionId } });
  } else {
    session = await prisma.chatSession.create({
      data: {
        userId: user.id,
        projectId,
        title: query.slice(0, 100),  // Auto-title from first query
        messages: [],
      },
    });
  }

  // Get project context
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  
  // Execute search pipeline
  const result = await executeSearch(query, {
    projectId,
    projectName: project.name,
    userId: user.id,
    userRole,
    sessionId: session.id,
    documentTypes,
  });

  // Append messages to session
  const messages = (session.messages as any[]) || [];
  const userMsg = { id: cuid(), role: "user", content: query, timestamp: new Date().toISOString() };
  const assistantMsg = {
    id: cuid(),
    role: "assistant",
    content: result.response,
    sources: result.sources,
    scope: result.scope,
    confidence: result.confidence,
    timestamp: new Date().toISOString(),
  };
  
  await prisma.chatSession.update({
    where: { id: session.id },
    data: { messages: [...messages, userMsg, assistantMsg] },
  });

  return NextResponse.json({
    ...result,
    sessionId: session.id,
    messageId: assistantMsg.id,
  });
}
```

### Step 5: Session API Routes

**GET /api/chat/sessions** — List sessions (Cap1 spec 6.4)
**GET /api/chat/sessions/[sessionId]** — Session detail with messages (Cap1 spec 6.5)
**DELETE /api/chat/sessions/[sessionId]** — Archive or delete (Cap1 spec 6.6)

### Step 6: Streaming Response (SSE)

For better UX, add streaming support. Create an alternative endpoint or modify POST /api/chat to support streaming:

```typescript
// When Accept: text/event-stream header is present
export async function POST(request: NextRequest) {
  // ... auth, validation, session management ...

  const stream = new ReadableStream({
    async start(controller) {
      // Send status updates as the pipeline progresses
      controller.enqueue(formatSSE({ type: "status", message: "Classifying query..." }));
      
      const classification = await classifyQuery(query, projectContext);
      controller.enqueue(formatSSE({ type: "status", message: "Searching documents..." }));
      
      const chunks = await searchAndRank(query, options);
      controller.enqueue(formatSSE({ type: "status", message: "Generating answer..." }));
      controller.enqueue(formatSSE({ type: "sources", data: formatSources(chunks) }));
      
      const answer = await generateSearchAnswer(query, chunks, context);
      controller.enqueue(formatSSE({ type: "answer", data: answer }));
      
      controller.enqueue(formatSSE({ type: "done" }));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function formatSSE(data: any): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}
```

### Step 7: Suggested Search Prompts Endpoint

**GET /api/projects/[projectId]/search/suggestions** (Cap1 spec 6.7)

Generate contextual suggested prompts based on the project's indexed documents:

```typescript
export async function GET(request: NextRequest, { params }: { params: { projectId: string } }) {
  // Get document stats for the project
  const stats = await prisma.document.groupBy({
    by: ["type"],
    where: { projectId: params.projectId, status: "READY" },
    _count: true,
  });
  
  // Generate suggestions based on available document types
  // Use Claude Sonnet with project context
  
  return NextResponse.json({ suggestions, documentStats });
}
```

### Step 8: Verify

End-to-end test:
1. Upload 2-3 construction documents (spec, addendum, drawing) via Phase 3
2. Wait for processing to complete
3. POST /api/chat with query: "What are the waterproofing requirements?"
4. Verify response includes:
   - Markdown answer with [source: ...] citations
   - Sources array with documentId, pageNumber, sectionRef
   - Scope badge (PROJECT)
   - Confidence score
   - Suggested follow-up prompts
5. Send follow-up query with same sessionId
6. Verify session has both exchanges in messages array

Test conflict detection:
- Upload a spec and drawing with contradictory info
- Query about the contradiction
- Verify CONFLICT alert appears in response

Test cross-project:
- Query "How does this compare across projects?"
- Verify scope classifies as CROSS_PROJECT
- Verify results grouped by project
```

## Success Criteria
- [ ] Query classification correctly detects scope and intent
- [ ] Claude Sonnet generates answers with inline citations
- [ ] Sources properly map back to document chunks
- [ ] Conflict detection works when documents contradict
- [ ] Session management persists multi-turn conversations
- [ ] Suggested prompts are contextual and relevant
- [ ] SSE streaming provides real-time progress updates
- [ ] All searches logged to SearchQuery and AuditLog
