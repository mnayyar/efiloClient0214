import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { inngest } from "@/lib/inngest";
import { rateLimitGeneral } from "@/lib/rate-limit";

// POST — Re-process all READY documents in a project (re-run ingestion pipeline)
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

    // Find all READY documents in the project
    const documents = await prisma.document.findMany({
      where: { projectId, status: "READY" },
      select: { id: true },
    });

    if (documents.length === 0) {
      return NextResponse.json({ data: { requeued: 0 } });
    }

    // Delete all existing chunks and reset status
    for (const doc of documents) {
      await prisma.documentChunk.deleteMany({ where: { documentId: doc.id } });
      await prisma.document.update({
        where: { id: doc.id },
        data: { status: "PROCESSING" },
      });
    }

    // Trigger re-ingestion for each document
    await inngest.send(
      documents.map((doc) => ({
        name: "document.uploaded" as const,
        data: { documentId: doc.id, projectId },
      }))
    );

    return NextResponse.json({ data: { requeued: documents.length } });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthError") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Bulk reprocess error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
