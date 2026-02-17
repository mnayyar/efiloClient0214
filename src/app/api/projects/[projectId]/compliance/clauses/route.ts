import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";
import { getProjectClauses } from "@/services/compliance/parser";
import { ContractClauseKind } from "@prisma/client";

// GET /api/projects/[projectId]/compliance/clauses
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

    // Verify project exists
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
    const kind = searchParams.get("kind");
    const requiresReview = searchParams.get("requiresReview");
    const sourceDocId = searchParams.get("sourceDocId");

    const clauses = await getProjectClauses(projectId, {
      ...(kind &&
        Object.values(ContractClauseKind).includes(
          kind as ContractClauseKind
        ) && { kind }),
      ...(requiresReview === "true" || requiresReview === "false"
        ? { requiresReview: requiresReview === "true" }
        : {}),
      ...(sourceDocId && { sourceDocId }),
    });

    return NextResponse.json({
      data: {
        clauses,
        total: clauses.length,
        requiresReviewCount: clauses.filter((c) => c.requiresReview).length,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("List clauses error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[projectId]/compliance/clauses — bulk delete by sourceDocId
export async function DELETE(
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
    const { searchParams } = new URL(request.url);
    const sourceDocId = searchParams.get("sourceDocId");

    if (!sourceDocId) {
      return NextResponse.json(
        { error: "sourceDocId query param is required for bulk delete" },
        { status: 400 }
      );
    }

    const deleted = await prisma.contractClause.deleteMany({
      where: { projectId, sourceDocId },
    });

    await prisma.complianceAuditLog.create({
      data: {
        projectId,
        eventType: "CLAUSES_DELETED",
        entityType: "ContractClause",
        entityId: sourceDocId,
        actorType: "USER",
        userId: user.id,
        action: "bulk_deleted",
        details: { deletedCount: deleted.count, sourceDocId },
      },
    });

    return NextResponse.json({
      data: { deletedCount: deleted.count },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Delete clauses error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
