import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { rateLimitSearch } from "@/lib/rate-limit";
import { searchAndRank, logSearchAnalytics } from "@/services/search";

const crossProjectSchema = z.object({
  query: z.string().min(3),
  types: z.array(z.string()).optional(),
  activeProjectId: z.string().optional(),
});

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
    const parsed = crossProjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { query, types, activeProjectId } = parsed.data;

    // Execute cross-project search (no projectId filter)
    const { searchResponse } = await searchAndRank({
      query,
      projectId: activeProjectId ?? "",
      scope: "CROSS_PROJECT",
      documentTypes: types,
      activeProjectId,
    });

    // Log analytics
    await logSearchAnalytics({
      userId: user.id,
      query,
      scope: "CROSS_PROJECT",
      resultCount: searchResponse.totalChunks,
      searchTimeMs: searchResponse.searchTimeMs,
    });

    return NextResponse.json({ data: searchResponse });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthError") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Cross-project search error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
