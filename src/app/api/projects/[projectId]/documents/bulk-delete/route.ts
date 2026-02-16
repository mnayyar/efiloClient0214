import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { deleteFromR2 } from "@/lib/r2";
import { inngest } from "@/lib/inngest";
import { rateLimitGeneral } from "@/lib/rate-limit";

const bulkDeleteSchema = z.object({
  documentIds: z.array(z.string()).min(1).max(50),
});

// POST — Bulk delete documents (R2 + DB + references)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!rateLimitGeneral(user.id)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const parsed = bulkDeleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { documentIds } = parsed.data;

    // Fetch all documents that belong to this project
    const documents = await prisma.document.findMany({
      where: {
        id: { in: documentIds },
        projectId,
      },
      select: { id: true, r2Key: true },
    });

    if (documents.length === 0) {
      return NextResponse.json({ error: "No matching documents found" }, { status: 404 });
    }

    const deletedIds = documents.map((d) => d.id);

    // 1. Bulk delete from DB (cascade handles chunks, embeddings, revisions)
    await prisma.document.deleteMany({
      where: { id: { in: deletedIds } },
    });

    // 2. Clean up sourceDocIds references across related models
    await cleanupBulkDocReferences(deletedIds);

    // 3. Delete from R2 — fire deferred cleanup for any failures
    const r2Failures: string[] = [];
    for (const doc of documents) {
      try {
        await deleteFromR2(doc.r2Key);
      } catch {
        r2Failures.push(doc.r2Key);
      }
    }

    // Queue failed R2 deletes for retry
    if (r2Failures.length > 0) {
      console.error(`R2 bulk delete: ${r2Failures.length} failures, queuing cleanup`);
      await Promise.all(
        r2Failures.map((r2Key) =>
          inngest.send({ name: "document.r2-cleanup", data: { r2Key } })
        )
      );
    }

    return NextResponse.json({
      data: {
        deleted: deletedIds.length,
        requested: documentIds.length,
        r2Queued: r2Failures.length,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthError") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Bulk delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function cleanupBulkDocReferences(docIds: string[]) {
  try {
    const docIdSet = new Set(docIds);

    // RFIs
    const rfis = await prisma.rFI.findMany({
      where: { sourceDocIds: { hasSome: docIds } },
      select: { id: true, sourceDocIds: true },
    });
    for (const rfi of rfis) {
      await prisma.rFI.update({
        where: { id: rfi.id },
        data: { sourceDocIds: rfi.sourceDocIds.filter((id) => !docIdSet.has(id)) },
      });
    }

    // ChangeEvents
    const changes = await prisma.changeEvent.findMany({
      where: { sourceDocIds: { hasSome: docIds } },
      select: { id: true, sourceDocIds: true },
    });
    for (const ce of changes) {
      await prisma.changeEvent.update({
        where: { id: ce.id },
        data: { sourceDocIds: ce.sourceDocIds.filter((id) => !docIdSet.has(id)) },
      });
    }

    // TalkingPoints
    const tps = await prisma.talkingPoint.findMany({
      where: { sourceDocIds: { hasSome: docIds } },
      select: { id: true, sourceDocIds: true },
    });
    for (const tp of tps) {
      await prisma.talkingPoint.update({
        where: { id: tp.id },
        data: { sourceDocIds: tp.sourceDocIds.filter((id) => !docIdSet.has(id)) },
      });
    }
  } catch (err) {
    console.error("Bulk reference cleanup error (non-fatal):", err);
  }
}
