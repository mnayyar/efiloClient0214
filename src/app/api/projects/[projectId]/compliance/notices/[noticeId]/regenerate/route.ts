import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";
import { regenerateNoticeLetter } from "@/services/compliance/notices";

const regenerateSchema = z.object({
  customInstructions: z.string().max(2000).optional(),
});

// POST /api/projects/[projectId]/compliance/notices/[noticeId]/regenerate
export async function POST(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ projectId: string; noticeId: string }> }
) {
  try {
    const user = await requireAuth(request);

    if (!rateLimitGeneral(user.id)) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    const { projectId, noticeId } = await params;

    const notice = await prisma.complianceNotice.findFirst({
      where: { id: noticeId, projectId },
    });
    if (!notice) {
      return NextResponse.json(
        { error: "Notice not found in this project" },
        { status: 404 }
      );
    }

    if (notice.status !== "DRAFT" && notice.status !== "PENDING_REVIEW") {
      return NextResponse.json(
        { error: `Cannot regenerate a notice with status: ${notice.status}` },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = regenerateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await regenerateNoticeLetter(
      noticeId,
      parsed.data.customInstructions
    );

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Regenerate notice error:", error);
    return NextResponse.json(
      { error: "Failed to regenerate notice" },
      { status: 500 }
    );
  }
}
