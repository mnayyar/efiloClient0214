import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { checkRfiCompliance } from "@/services/compliance/integrations";

// POST /api/projects/[projectId]/rfis/[rfiId]/check-compliance
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; rfiId: string }> }
) {
  try {
    const user = await requireAuth(request);

    if (!rateLimitGeneral(user.id)) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    const { projectId, rfiId } = await params;

    // Verify RFI belongs to this project
    const rfi = await prisma.rFI.findFirst({
      where: { id: rfiId, projectId },
      select: { id: true },
    });
    if (!rfi) {
      return NextResponse.json(
        { error: "RFI not found in this project" },
        { status: 404 }
      );
    }

    const result = await checkRfiCompliance(rfiId, user.id);

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("RFI compliance check error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
