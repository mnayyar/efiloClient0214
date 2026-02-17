import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { checkChangeEventCompliance } from "@/services/compliance/integrations";

// POST /api/projects/[projectId]/changes/[changeId]/check-compliance
export async function POST(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ projectId: string; changeId: string }> }
) {
  try {
    const user = await requireAuth(request);

    if (!rateLimitGeneral(user.id)) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    const { projectId, changeId } = await params;

    // Verify change event belongs to this project
    const change = await prisma.changeEvent.findFirst({
      where: { id: changeId, projectId },
      select: { id: true },
    });
    if (!change) {
      return NextResponse.json(
        { error: "Change event not found in this project" },
        { status: 404 }
      );
    }

    const result = await checkChangeEventCompliance(changeId, user.id);

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Change event compliance check error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
