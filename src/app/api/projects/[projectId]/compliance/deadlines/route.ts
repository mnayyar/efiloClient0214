import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";
import {
  createDeadline,
  getProjectDeadlines,
} from "@/services/compliance/deadlines";
import { DeadlineStatus, Severity, TriggerEventType } from "@prisma/client";

const createDeadlineSchema = z.object({
  clauseId: z.string().min(1),
  triggerEventType: z.enum([
    "CHANGE_ORDER",
    "RFI",
    "SCHEDULE_DELAY",
    "DISCOVERY",
    "DIRECTIVE",
    "CLAIM",
    "DEFECT",
    "OTHER",
  ]),
  triggerEventId: z.string().optional(),
  triggerDescription: z.string().min(1).max(2000),
  triggeredAt: z.string().datetime(),
});

// GET /api/projects/[projectId]/compliance/deadlines
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
    const status = searchParams.get("status");
    const severity = searchParams.get("severity");
    const sortBy = searchParams.get("sortBy");

    const result = await getProjectDeadlines(projectId, {
      ...(status &&
        Object.values(DeadlineStatus).includes(status as DeadlineStatus) && {
          status: status as DeadlineStatus,
        }),
      ...(severity &&
        Object.values(Severity).includes(severity as Severity) && {
          severity: severity as Severity,
        }),
      ...(sortBy &&
        ["deadline", "severity", "created"].includes(sortBy) && {
          sortBy: sortBy as "deadline" | "severity" | "created",
        }),
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("List deadlines error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/projects/[projectId]/compliance/deadlines
export async function POST(
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

    const body = await request.json();
    const parsed = createDeadlineSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      clauseId,
      triggerEventType,
      triggerEventId,
      triggerDescription,
      triggeredAt,
    } = parsed.data;

    // Verify clause belongs to this project
    const clause = await prisma.contractClause.findFirst({
      where: { id: clauseId, projectId },
    });
    if (!clause) {
      return NextResponse.json(
        { error: "Clause not found in this project" },
        { status: 404 }
      );
    }

    const deadline = await createDeadline({
      projectId,
      clauseId,
      triggerEventType: triggerEventType as TriggerEventType,
      triggerEventId,
      triggerDescription,
      triggeredAt: new Date(triggeredAt),
      triggeredBy: user.id,
    });

    return NextResponse.json({ data: deadline }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (
      error instanceof Error &&
      error.message.includes("no deadline configured")
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Create deadline error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
