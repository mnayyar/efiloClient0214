import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";
import { updateNoticeContent } from "@/services/compliance/notices";

// DELETE /api/projects/[projectId]/compliance/notices/[noticeId]
export async function DELETE(
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

    // Only allow deleting DRAFT or PENDING_REVIEW notices
    if (notice.status !== "DRAFT" && notice.status !== "PENDING_REVIEW") {
      return NextResponse.json(
        { error: `Cannot delete a notice with status: ${notice.status}` },
        { status: 400 }
      );
    }

    await prisma.complianceNotice.delete({
      where: { id: noticeId },
    });

    // Audit log
    await prisma.complianceAuditLog.create({
      data: {
        projectId,
        eventType: "NOTICE_DELETED",
        entityType: "ComplianceNotice",
        entityId: noticeId,
        actorType: "USER",
        userId: user.id,
        action: "deleted",
        details: JSON.parse(
          JSON.stringify({
            title: notice.title,
            status: notice.status,
          })
        ),
      },
    });

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Delete notice error:", error);
    return NextResponse.json(
      { error: "Failed to delete notice" },
      { status: 500 }
    );
  }
}

const VALID_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "SENT",
  "ACKNOWLEDGED",
  "EXPIRED",
  "VOID",
] as const;

const updateSchema = z.object({
  content: z.string().min(1).optional(),
  title: z.string().min(1).max(500).optional(),
  status: z.enum(VALID_STATUSES).optional(),
});

// PATCH /api/projects/[projectId]/compliance/notices/[noticeId]
export async function PATCH(
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

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Content edits only allowed for DRAFT/PENDING_REVIEW
    if (
      parsed.data.content &&
      notice.status !== "DRAFT" &&
      notice.status !== "PENDING_REVIEW"
    ) {
      return NextResponse.json(
        { error: `Cannot edit content of a notice with status: ${notice.status}` },
        { status: 400 }
      );
    }

    let updated = notice;

    // Update content if provided
    if (parsed.data.content) {
      updated = await updateNoticeContent(
        noticeId,
        parsed.data.content,
        user.id
      );
    }

    // Build additional updates (title, status)
    const extraUpdates: Record<string, unknown> = {};
    if (parsed.data.title) extraUpdates.title = parsed.data.title;
    if (parsed.data.status) {
      extraUpdates.status = parsed.data.status;

      // If marking as ACKNOWLEDGED, set deliveredAt
      if (parsed.data.status === "ACKNOWLEDGED" && !notice.deliveredAt) {
        extraUpdates.deliveredAt = new Date();
        extraUpdates.onTimeStatus = true;
      }
    }

    if (Object.keys(extraUpdates).length > 0) {
      updated = await prisma.complianceNotice.update({
        where: { id: noticeId },
        data: extraUpdates,
      });
    }

    // Audit log for status changes
    if (parsed.data.status && parsed.data.status !== notice.status) {
      await prisma.complianceAuditLog.create({
        data: {
          projectId,
          eventType: "NOTICE_STATUS_CHANGED",
          entityType: "ComplianceNotice",
          entityId: noticeId,
          actorType: "USER",
          userId: user.id,
          action: "status_changed",
          details: JSON.parse(
            JSON.stringify({
              from: notice.status,
              to: parsed.data.status,
            })
          ),
        },
      });
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Update notice error:", error);
    return NextResponse.json(
      { error: "Failed to update notice" },
      { status: 500 }
    );
  }
}
