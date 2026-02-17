import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { searchComplianceData } from "@/services/compliance/integrations";

const VALID_TYPES = [
  "contract_clause",
  "compliance_deadline",
  "compliance_notice",
] as const;

// GET /api/projects/[projectId]/compliance/search?q=...&types=...&status=...&severity=...
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
    const query = searchParams.get("q");
    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: "Query parameter 'q' is required" },
        { status: 400 }
      );
    }

    const typesParam = searchParams.get("types");
    const types = typesParam
      ? (typesParam.split(",").filter((t) =>
          VALID_TYPES.includes(t as (typeof VALID_TYPES)[number])
        ) as (typeof VALID_TYPES)[number][])
      : undefined;

    const status = searchParams.get("status") || undefined;
    const severity = searchParams.get("severity") || undefined;

    const results = await searchComplianceData(projectId, query.trim(), {
      types: types?.length ? types : undefined,
      status,
      severity,
    });

    return NextResponse.json({ data: { results, total: results.length } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Compliance search error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
