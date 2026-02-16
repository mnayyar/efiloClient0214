import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitSearch } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import {
  classifyQuery,
  searchAndRank,
  generateSearchAnswer,
  generateSuggestedPrompts,
  logSearchAnalytics,
} from "@/services/search";
import { generateWebSearchResponse } from "@/lib/ai";
import { createId } from "@paralleldrive/cuid2";
import type { Prisma } from "@prisma/client";

const chatRequestSchema = z.object({
  query: z.string().min(1).max(2000),
  sessionId: z.string().nullish(),
  projectId: z.string(),
  documentTypes: z.array(z.string()).optional(),
  userRole: z.string().optional(),
  scope: z.enum(["PROJECT", "CROSS_PROJECT", "WORLD"]).optional(),
});

function formatSSE(data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    if (!rateLimitSearch(user.id)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Max 10 searches per minute." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { query, sessionId, projectId, documentTypes, userRole, scope: userScope } =
      parsed.data;

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Get or create chat session
    let session;
    if (sessionId) {
      session = await prisma.chatSession.findUnique({
        where: { id: sessionId },
      });
      if (!session || session.userId !== user.id) {
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 }
        );
      }
    } else {
      session = await prisma.chatSession.create({
        data: {
          userId: user.id,
          projectId,
          title: query.slice(0, 100),
          messages: [],
        },
      });
    }

    // Check if client wants SSE streaming
    const acceptSSE =
      request.headers.get("accept")?.includes("text/event-stream");

    if (acceptSSE) {
      return handleStreamingResponse(
        query,
        project,
        user,
        session,
        documentTypes,
        userRole,
        userScope
      );
    }

    // Non-streaming: execute full pipeline and return JSON
    return handleJsonResponse(
      query,
      project,
      user,
      session,
      documentTypes,
      userRole,
      userScope
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleJsonResponse(
  query: string,
  project: { id: string; name: string },
  user: { id: string },
  session: { id: string; messages: unknown },
  documentTypes?: string[],
  userRole?: string,
  userScope?: "PROJECT" | "CROSS_PROJECT" | "WORLD"
) {
  const start = Date.now();

  // ── WORLD scope: skip classification & document search, use web search ──
  if (userScope === "WORLD") {
    const webResult = await generateWebSearchResponse(query);
    const searchTimeMs = Date.now() - start;

    const messages = (session.messages as Prisma.JsonArray) || [];
    const assistantMsgId = createId();

    const userMsg: Prisma.JsonObject = {
      id: createId(),
      role: "user",
      content: query,
      timestamp: new Date().toISOString(),
    };
    const assistantMsg: Prisma.JsonObject = {
      id: assistantMsgId,
      role: "assistant",
      content: webResult.content,
      scope: "WORLD",
      webCitations: webResult.citations as unknown as Prisma.JsonArray,
      timestamp: new Date().toISOString(),
    };

    await prisma.chatSession.update({
      where: { id: session.id },
      data: { messages: [...messages, userMsg, assistantMsg] },
    });

    await logSearchAnalytics({
      userId: user.id,
      query,
      scope: "WORLD",
      projectId: project.id,
      resultCount: webResult.citations.length,
      searchTimeMs,
      tokenCount: webResult.tokensUsed.input + webResult.tokensUsed.output,
    });

    return NextResponse.json({
      data: {
        response: webResult.content,
        webCitations: webResult.citations,
        scope: "WORLD",
        searchTimeMs,
        sessionId: session.id,
        messageId: assistantMsgId,
      },
    });
  }

  // ── PROJECT / CROSS_PROJECT: existing document search pipeline ──

  // 1. Classify
  const classification = await classifyQuery(query, {
    projectId: project.id,
    projectName: project.name,
  });

  // User-selected scope overrides classification
  const scope = userScope ?? classification.scope;

  const docTypes =
    documentTypes && documentTypes.length > 0
      ? documentTypes
      : classification.documentTypes.length > 0
        ? classification.documentTypes
        : undefined;

  // 2. Search & rank
  const { results: chunks } = await searchAndRank({
    query,
    projectId: project.id,
    scope,
    documentTypes: docTypes,
    activeProjectId: project.id,
  });

  // 3. Generate answer
  const answer = await generateSearchAnswer(query, chunks, {
    projectName: project.name,
    scope: scope,
    userRole,
  });

  // 4. Suggested prompts
  const suggestedPrompts = await generateSuggestedPrompts(query, chunks, {
    projectName: project.name,
    scope: scope,
    userRole,
  });

  const searchTimeMs = Date.now() - start;

  // 5. Append messages to session
  const messages = (session.messages as Prisma.JsonArray) || [];
  const userMsgId = createId();
  const assistantMsgId = createId();

  const userMsg: Prisma.JsonObject = {
    id: userMsgId,
    role: "user",
    content: query,
    timestamp: new Date().toISOString(),
  };
  const assistantMsg: Prisma.JsonObject = {
    id: assistantMsgId,
    role: "assistant",
    content: answer.response,
    sources: answer.sources as unknown as Prisma.JsonArray,
    scope: scope,
    confidence: answer.confidence,
    alerts: answer.alerts as unknown as Prisma.JsonArray,
    timestamp: new Date().toISOString(),
  };

  await prisma.chatSession.update({
    where: { id: session.id },
    data: { messages: [...messages, userMsg, assistantMsg] },
  });

  // 6. Log analytics
  await logSearchAnalytics({
    userId: user.id,
    query,
    scope: scope,
    projectId: project.id,
    resultCount: chunks.length,
    searchTimeMs,
    tokenCount: answer.tokensUsed.input + answer.tokensUsed.output,
  });

  return NextResponse.json({
    data: {
      response: answer.response,
      sources: answer.sources,
      scope: scope,
      searchTimeMs,
      confidence: answer.confidence,
      suggestedPrompts,
      alerts: answer.alerts,
      sessionId: session.id,
      messageId: assistantMsgId,
    },
  });
}

function handleStreamingResponse(
  query: string,
  project: { id: string; name: string },
  user: { id: string },
  session: { id: string; messages: unknown },
  documentTypes?: string[],
  userRole?: string,
  userScope?: "PROJECT" | "CROSS_PROJECT" | "WORLD"
) {
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const start = Date.now();

        // ── WORLD scope: skip classification & document search, use web search ──
        if (userScope === "WORLD") {
          controller.enqueue(
            formatSSE({ type: "status", message: "Searching the web..." })
          );

          const webResult = await generateWebSearchResponse(query);

          controller.enqueue(
            formatSSE({
              type: "answer",
              data: {
                response: webResult.content,
                webCitations: webResult.citations,
              },
            })
          );

          // Save session messages
          const messages = (session.messages as Prisma.JsonArray) || [];
          const assistantMsgId = createId();

          const userMsg: Prisma.JsonObject = {
            id: createId(),
            role: "user",
            content: query,
            timestamp: new Date().toISOString(),
          };
          const assistantMsg: Prisma.JsonObject = {
            id: assistantMsgId,
            role: "assistant",
            content: webResult.content,
            scope: "WORLD",
            webCitations: webResult.citations as unknown as Prisma.JsonArray,
            timestamp: new Date().toISOString(),
          };

          await prisma.chatSession.update({
            where: { id: session.id },
            data: { messages: [...messages, userMsg, assistantMsg] },
          });

          const searchTimeMs = Date.now() - start;

          // Non-blocking analytics — don't let logging failures break the response
          logSearchAnalytics({
            userId: user.id,
            query,
            scope: "WORLD",
            projectId: project.id,
            resultCount: webResult.citations.length,
            searchTimeMs,
            tokenCount: webResult.tokensUsed.input + webResult.tokensUsed.output,
          }).catch((err) => console.error("Analytics error:", err));

          controller.enqueue(
            formatSSE({
              type: "done",
              data: {
                sessionId: session.id,
                messageId: assistantMsgId,
                searchTimeMs,
              },
            })
          );
          controller.close();
          return;
        }

        // ── PROJECT / CROSS_PROJECT: existing document search pipeline ──

        // 1. Classify
        controller.enqueue(
          formatSSE({ type: "status", message: "Classifying query..." })
        );

        const classification = await classifyQuery(query, {
          projectId: project.id,
          projectName: project.name,
        });

        // User-selected scope overrides classification
        const scope = userScope ?? classification.scope;

        controller.enqueue(
          formatSSE({
            type: "classification",
            data: {
              scope,
              intent: classification.intent,
            },
          })
        );

        const docTypes =
          documentTypes && documentTypes.length > 0
            ? documentTypes
            : classification.documentTypes.length > 0
              ? classification.documentTypes
              : undefined;

        // 2. Search
        controller.enqueue(
          formatSSE({ type: "status", message: "Searching documents..." })
        );

        const { results: chunks } = await searchAndRank({
          query,
          projectId: project.id,
          scope: scope,
          documentTypes: docTypes,
          activeProjectId: project.id,
        });

        // Send sources as soon as search completes
        const sources = chunks.map((c, i) => ({
          index: i + 1,
          documentId: c.documentId,
          documentName: c.documentName,
          documentType: c.documentType,
          pageNumber: c.pageNumber,
          sectionRef: c.sectionRef,
          chunkId: c.chunkId,
        }));

        controller.enqueue(formatSSE({ type: "sources", data: sources }));

        // 3. Generate answer
        controller.enqueue(
          formatSSE({ type: "status", message: "Generating answer..." })
        );

        const answer = await generateSearchAnswer(query, chunks, {
          projectName: project.name,
          scope: scope,
          userRole,
        });

        controller.enqueue(
          formatSSE({
            type: "answer",
            data: {
              response: answer.response,
              confidence: answer.confidence,
              alerts: answer.alerts,
            },
          })
        );

        // 4. Suggested prompts
        const suggestedPrompts = await generateSuggestedPrompts(
          query,
          chunks,
          {
            projectName: project.name,
            scope: scope,
            userRole,
          }
        );

        controller.enqueue(
          formatSSE({ type: "suggestions", data: suggestedPrompts })
        );

        // 5. Save session messages
        const messages =
          (session.messages as Prisma.JsonArray) || [];
        const assistantMsgId = createId();

        const userMsg: Prisma.JsonObject = {
          id: createId(),
          role: "user",
          content: query,
          timestamp: new Date().toISOString(),
        };
        const assistantMsg: Prisma.JsonObject = {
          id: assistantMsgId,
          role: "assistant",
          content: answer.response,
          sources: answer.sources as unknown as Prisma.JsonArray,
          scope: scope,
          confidence: answer.confidence,
          alerts: answer.alerts as unknown as Prisma.JsonArray,
          timestamp: new Date().toISOString(),
        };

        await prisma.chatSession.update({
          where: { id: session.id },
          data: { messages: [...messages, userMsg, assistantMsg] },
        });

        const searchTimeMs = Date.now() - start;

        // 6. Log analytics
        await logSearchAnalytics({
          userId: user.id,
          query,
          scope: scope,
          projectId: project.id,
          resultCount: chunks.length,
          searchTimeMs,
          tokenCount: answer.tokensUsed.input + answer.tokensUsed.output,
        });

        // Done
        controller.enqueue(
          formatSSE({
            type: "done",
            data: {
              sessionId: session.id,
              messageId: assistantMsgId,
              searchTimeMs,
            },
          })
        );
        controller.close();
      } catch (error) {
        controller.enqueue(
          formatSSE({
            type: "error",
            message:
              error instanceof Error ? error.message : "An error occurred",
          })
        );
        controller.close();
      }
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
