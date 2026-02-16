import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { deleteFromR2 } from "@/lib/r2";
import { inngest } from "@/lib/inngest";
import { rateLimitGeneral } from "@/lib/rate-limit";

type Params = { params: Promise<{ projectId: string; docId: string }> };

// GET — Get document metadata
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(request);
    if (!rateLimitGeneral(user.id)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const { projectId, docId } = await params;

    const document = await prisma.document.findUnique({
      where: { id: docId },
      include: {
        _count: { select: { chunks: true } },
      },
    });

    if (!document || document.projectId !== projectId) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        id: document.id,
        name: document.name,
        type: document.type,
        status: document.status,
        mimeType: document.mimeType,
        fileSize: document.fileSize,
        pageCount: document.pageCount,
        chunkCount: document._count.chunks,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthError") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Document get error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH — Re-process document (re-run ingestion pipeline)
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(request);
    if (!rateLimitGeneral(user.id)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const { projectId, docId } = await params;

    const document = await prisma.document.findUnique({
      where: { id: docId },
    });

    if (!document || document.projectId !== projectId) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Delete existing chunks (they'll be recreated during ingestion)
    await prisma.documentChunk.deleteMany({ where: { documentId: docId } });

    // Set status to PROCESSING
    await prisma.document.update({
      where: { id: docId },
      data: { status: "PROCESSING" },
    });

    // Trigger re-ingestion
    await inngest.send({
      name: "document.uploaded",
      data: { documentId: docId, projectId },
    });

    return NextResponse.json({ data: { success: true, status: "PROCESSING" } });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthError") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Document reprocess error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE — Delete document + cascade chunks + remove from R2 + clean references
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(request);
    if (!rateLimitGeneral(user.id)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const { projectId, docId } = await params;

    const document = await prisma.document.findUnique({
      where: { id: docId },
    });

    if (!document || document.projectId !== projectId) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // 1. Delete from DB first (cascade handles chunks, embeddings, revisions)
    await prisma.document.delete({ where: { id: docId } });

    // 2. Clean up sourceDocIds references across related models
    await cleanupDocReferences(docId);

    // 3. Delete from R2 — if it fails, queue for deferred cleanup
    try {
      await deleteFromR2(document.r2Key);
    } catch (r2Error) {
      console.error("R2 delete failed, queuing cleanup:", r2Error);
      await inngest.send({
        name: "document.r2-cleanup",
        data: { r2Key: document.r2Key },
      });
    }

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthError") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Document delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Remove a deleted document ID from sourceDocIds arrays across RFI,
 * ChangeEvent, and TalkingPoint models.
 */
async function cleanupDocReferences(docId: string) {
  try {
    // RFIs — remove from sourceDocIds
    const rfisWithDoc = await prisma.rFI.findMany({
      where: { sourceDocIds: { has: docId } },
      select: { id: true, sourceDocIds: true },
    });
    for (const rfi of rfisWithDoc) {
      await prisma.rFI.update({
        where: { id: rfi.id },
        data: { sourceDocIds: rfi.sourceDocIds.filter((id) => id !== docId) },
      });
    }

    // ChangeEvents — remove from sourceDocIds
    const changesWithDoc = await prisma.changeEvent.findMany({
      where: { sourceDocIds: { has: docId } },
      select: { id: true, sourceDocIds: true },
    });
    for (const ce of changesWithDoc) {
      await prisma.changeEvent.update({
        where: { id: ce.id },
        data: { sourceDocIds: ce.sourceDocIds.filter((id) => id !== docId) },
      });
    }

    // TalkingPoints — remove from sourceDocIds
    const tpsWithDoc = await prisma.talkingPoint.findMany({
      where: { sourceDocIds: { has: docId } },
      select: { id: true, sourceDocIds: true },
    });
    for (const tp of tpsWithDoc) {
      await prisma.talkingPoint.update({
        where: { id: tp.id },
        data: { sourceDocIds: tp.sourceDocIds.filter((id) => id !== docId) },
      });
    }
  } catch (err) {
    // Non-critical — log but don't fail the delete
    console.error("Reference cleanup error (non-fatal):", err);
  }
}
