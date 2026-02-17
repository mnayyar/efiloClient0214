import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";
import {
  createNotice,
  getProjectNotices,
} from "@/services/compliance/notices";
import { ComplianceNoticeType, ComplianceNoticeStatus } from "@prisma/client";

const createNoticeSchema = z.object({
  deadlineId: z.string().min(1),
  clauseId: z.string().min(1),
  recipientName: z.string().min(1).max(500),
  recipientEmail: z.string().email().optional(),
  generateWithAI: z.boolean().default(true),
});

// GET /api/projects/[projectId]/compliance/notices
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
    const type = searchParams.get("type");
    const status = searchParams.get("status");

    const notices = await getProjectNotices(projectId, {
      ...(type &&
        Object.values(ComplianceNoticeType).includes(
          type as ComplianceNoticeType
        ) && { type: type as ComplianceNoticeType }),
      ...(status &&
        Object.values(ComplianceNoticeStatus).includes(
          status as ComplianceNoticeStatus
        ) && { status: status as ComplianceNoticeStatus }),
    });

    return NextResponse.json({ data: { notices, total: notices.length } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("List notices error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/projects/[projectId]/compliance/notices
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
    const parsed = createNoticeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const notice = await createNotice({
      projectId,
      deadlineId: parsed.data.deadlineId,
      clauseId: parsed.data.clauseId,
      recipientName: parsed.data.recipientName,
      recipientEmail: parsed.data.recipientEmail,
      generateWithAI: parsed.data.generateWithAI,
      createdById: user.id,
    });

    return NextResponse.json({ data: notice }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Create notice error:", error);
    return NextResponse.json(
      { error: "Failed to create notice" },
      { status: 500 }
    );
  }
}
