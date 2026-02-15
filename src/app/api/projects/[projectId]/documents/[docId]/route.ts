import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { deleteFromR2 } from "@/lib/r2";
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

// DELETE — Delete document + cascade chunks + remove from R2
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

    // Delete from R2
    try {
      await deleteFromR2(document.r2Key);
    } catch (r2Error) {
      console.error("R2 delete error (continuing):", r2Error);
    }

    // Delete from DB (chunks cascade due to onDelete: Cascade)
    await prisma.document.delete({ where: { id: docId } });

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthError") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Document delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
