import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";
import { Prisma } from "@prisma/client";
import { inngest } from "@/lib/inngest";

const updateRfiSchema = z.object({
  subject: z.string().min(1).max(500).optional(),
  question: z.string().min(1).optional(),
  status: z
    .enum(["DRAFT", "SUBMITTED", "PENDING_GC", "OPEN", "ANSWERED", "CLOSED", "VOID"])
    .optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  assignedTo: z.string().max(255).nullish(),
  dueDate: z.string().datetime().nullish(),
  response: z.string().nullish(),
  coFlag: z.boolean().optional(),
  coEstimate: z.number().positive().nullish(),
  sourceDocIds: z.array(z.string()).optional(),
});

// GET /api/projects/[projectId]/rfis/[rfiId] — Get single RFI
export async function GET(
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

    const rfi = await prisma.rFI.findFirst({
      where: { id: rfiId, projectId },
    });

    if (!rfi) {
      return NextResponse.json({ error: "RFI not found" }, { status: 404 });
    }

    return NextResponse.json({ data: rfi });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Get RFI error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[projectId]/rfis/[rfiId] — Update RFI
export async function PATCH(
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

    const existing = await prisma.rFI.findFirst({
      where: { id: rfiId, projectId },
    });
    if (!existing) {
      return NextResponse.json({ error: "RFI not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateRfiSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};

    if (parsed.data.subject !== undefined) data.subject = parsed.data.subject;
    if (parsed.data.question !== undefined) data.question = parsed.data.question;
    if (parsed.data.priority !== undefined) data.priority = parsed.data.priority;
    if (parsed.data.assignedTo !== undefined) data.assignedTo = parsed.data.assignedTo;
    if (parsed.data.dueDate !== undefined) {
      data.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
    }
    if (parsed.data.response !== undefined) data.response = parsed.data.response;
    if (parsed.data.coFlag !== undefined) data.coFlag = parsed.data.coFlag;
    if (parsed.data.coEstimate !== undefined) data.coEstimate = parsed.data.coEstimate;
    if (parsed.data.sourceDocIds !== undefined) data.sourceDocIds = parsed.data.sourceDocIds;

    // Handle status transitions
    if (parsed.data.status !== undefined) {
      data.status = parsed.data.status;
      if (parsed.data.status === "SUBMITTED" && !existing.submittedAt) {
        data.submittedAt = new Date();
      }
      if (parsed.data.status === "ANSWERED" && !existing.respondedAt) {
        data.respondedAt = new Date();
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ data: existing });
    }

    const updated = await prisma.rFI.update({
      where: { id: rfiId },
      data,
    });

    // If coFlag was just set to true, trigger compliance deadline check
    if (
      parsed.data.coFlag === true &&
      !existing.coFlag &&
      updated.coFlag
    ) {
      await inngest.send({
        name: "compliance/rfi-check",
        data: { rfiId, triggeredBy: user.id },
      });
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "RFI not found" }, { status: 404 });
    }
    console.error("Update RFI error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[projectId]/rfis/[rfiId] — Delete an RFI
export async function DELETE(
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

    const existing = await prisma.rFI.findFirst({
      where: { id: rfiId, projectId },
    });
    if (!existing) {
      return NextResponse.json({ error: "RFI not found" }, { status: 404 });
    }

    await prisma.rFI.delete({ where: { id: rfiId } });

    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "RFI not found" }, { status: 404 });
    }
    console.error("Delete RFI error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
