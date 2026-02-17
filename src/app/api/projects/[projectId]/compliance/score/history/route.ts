import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { getScoreHistory } from "@/services/compliance/scoring";

const VALID_PERIODS = ["week", "month", "quarter", "year"] as const;

// GET /api/projects/[projectId]/compliance/score/history?period=month
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await requireAuth(request);

    if (!rateLimitGeneral(user.id)) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    const { projectId } = await params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "month";

    if (!VALID_PERIODS.includes(period as (typeof VALID_PERIODS)[number])) {
      return NextResponse.json(
        { error: "Invalid period. Use: week, month, quarter, year" },
        { status: 400 }
      );
    }

    const history = await getScoreHistory(
      projectId,
      period as "week" | "month" | "quarter" | "year"
    );

    return NextResponse.json({ data: { history } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Get score history error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
