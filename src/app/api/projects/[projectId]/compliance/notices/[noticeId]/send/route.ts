import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";
import { sendNotice } from "@/services/compliance/notices";

const sendSchema = z.object({
  methods: z
    .array(
      z.enum([
        "EMAIL",
        "CERTIFIED_MAIL",
        "REGISTERED_MAIL",
        "HAND_DELIVERY",
        "FAX",
        "COURIER",
      ])
    )
    .min(1, "At least one delivery method is required"),
});

// POST /api/projects/[projectId]/compliance/notices/[noticeId]/send
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
        { error: `Cannot send a notice with status: ${notice.status}` },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await sendNotice(noticeId, parsed.data.methods, user.id);

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Send notice error:", error);
    return NextResponse.json(
      { error: "Failed to send notice" },
      { status: 500 }
    );
  }
}
