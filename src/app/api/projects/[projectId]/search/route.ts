import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { rateLimitSearch } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import {
  searchAndRank,
  classifyQuery,
  logSearchAnalytics,
} from "@/services/search";

const searchParamsSchema = z.object({
  q: z.string().min(3),
  scope: z.enum(["PROJECT", "CROSS_PROJECT"]).default("PROJECT"),
  types: z.string().optional(), // comma-separated
  classify: z.enum(["true", "false"]).default("true"),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await requireAuth(request);

    if (!rateLimitSearch(user.id)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Max 10 searches per minute." },
        { status: 429 }
      );
    }

    const { projectId } = await params;

    // Parse and validate query params
    const raw = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = searchParamsSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid search parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { q, scope, types, classify } = parsed.data;
    const documentTypes = types?.split(",").filter(Boolean);

    // Optional: classify query for scope/intent detection
    let classification = null;
    if (classify === "true") {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true },
      });
      if (project) {
        classification = await classifyQuery(q, {
          projectId,
          projectName: project.name,
        });
      }
    }

    // Use classification to refine scope/types if not explicitly set
    const effectiveScope = scope !== "PROJECT" ? scope : (classification?.scope ?? scope);
    const effectiveTypes =
      documentTypes && documentTypes.length > 0
        ? documentTypes
        : classification?.documentTypes?.length
          ? classification.documentTypes
          : undefined;

    // Execute search
    const { searchResponse } = await searchAndRank({
      query: q,
      projectId,
      scope: effectiveScope,
      documentTypes: effectiveTypes,
      activeProjectId: projectId,
    });

    // Log analytics
    await logSearchAnalytics({
      userId: user.id,
      query: q,
      scope: effectiveScope,
      projectId,
      resultCount: searchResponse.totalChunks,
      searchTimeMs: searchResponse.searchTimeMs,
    });

    return NextResponse.json({
      data: {
        ...searchResponse,
        classification,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthError") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
