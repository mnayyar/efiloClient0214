import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";
import { confirmDelivery } from "@/services/compliance/notices";

const confirmDeliverySchema = z.object({
  method: z.enum([
    "EMAIL",
    "CERTIFIED_MAIL",
    "REGISTERED_MAIL",
    "HAND_DELIVERY",
    "FAX",
    "COURIER",
  ]),
  trackingNumber: z.string().optional(),
  carrier: z.string().optional(),
  deliveredAt: z.string().datetime().optional(),
  signedBy: z.string().optional(),
  receivedBy: z.string().optional(),
});

// POST /api/projects/[projectId]/compliance/notices/[noticeId]/confirm-delivery
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

    if (notice.status !== "SENT") {
      return NextResponse.json(
        { error: `Cannot confirm delivery for notice with status: ${notice.status}` },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = confirmDeliverySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await confirmDelivery(noticeId, parsed.data, user.id);

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Confirm delivery error:", error);
    return NextResponse.json(
      { error: "Failed to confirm delivery" },
      { status: 500 }
    );
  }
}
