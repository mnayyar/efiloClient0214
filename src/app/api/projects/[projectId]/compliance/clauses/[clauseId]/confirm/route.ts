import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";
import { confirmClause } from "@/services/compliance/parser";
import { Prisma } from "@prisma/client";

const confirmSchema = z.object({
  deadlineDays: z.number().int().min(0).optional(),
  deadlineType: z
    .enum(["CALENDAR_DAYS", "BUSINESS_DAYS", "HOURS"])
    .optional(),
  noticeMethod: z
    .enum([
      "WRITTEN_NOTICE",
      "CERTIFIED_MAIL",
      "EMAIL",
      "HAND_DELIVERY",
      "REGISTERED_MAIL",
    ])
    .optional(),
  trigger: z.string().max(1000).optional(),
  curePeriodDays: z.number().int().min(0).optional(),
  curePeriodType: z
    .enum(["CALENDAR_DAYS", "BUSINESS_DAYS", "HOURS"])
    .optional(),
});

// PATCH /api/projects/[projectId]/compliance/clauses/[clauseId]/confirm
export async function PATCH(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ projectId: string; clauseId: string }> }
) {
  try {
    const user = await requireAuth(request);

    if (!rateLimitGeneral(user.id)) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    const { projectId, clauseId } = await params;

    // Verify clause exists and belongs to project
    const existing = await prisma.contractClause.findFirst({
      where: { id: clauseId, projectId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Clause not found in this project" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = confirmSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const clause = await confirmClause(clauseId, user.id, parsed.data);

    return NextResponse.json({ data: clause });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Clause not found" },
        { status: 404 }
      );
    }
    console.error("Confirm clause error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
