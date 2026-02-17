import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";
import { waiveDeadline } from "@/services/compliance/deadlines";

const waiveSchema = z.object({
  reason: z.string().min(1, "Waiver reason is required").max(2000),
});

// POST /api/projects/[projectId]/compliance/deadlines/[deadlineId]/waive
export async function POST(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ projectId: string; deadlineId: string }> }
) {
  try {
    const user = await requireAuth(request);

    if (!rateLimitGeneral(user.id)) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    const { projectId, deadlineId } = await params;

    // Verify deadline exists and belongs to project
    const existing = await prisma.complianceDeadline.findFirst({
      where: { id: deadlineId, projectId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Deadline not found in this project" },
        { status: 404 }
      );
    }

    if (existing.status !== "ACTIVE") {
      return NextResponse.json(
        { error: `Cannot waive a deadline with status: ${existing.status}` },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = waiveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const deadline = await waiveDeadline(deadlineId, user.id, parsed.data.reason);

    return NextResponse.json({ data: deadline });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Waive deadline error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
