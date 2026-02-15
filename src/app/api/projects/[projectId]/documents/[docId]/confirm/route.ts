import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { inngest } from "@/lib/inngest";

// POST — Confirm upload, trigger processing
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; docId: string }> }
) {
  try {
    const user = await requireAuth(request);

    const { projectId, docId } = await params;

    const document = await prisma.document.findUnique({
      where: { id: docId },
    });

    if (!document || document.projectId !== projectId) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (document.status !== "UPLOADING") {
      return NextResponse.json(
        { error: "Document is not in UPLOADING state" },
        { status: 400 }
      );
    }

    // Update status to PROCESSING
    await prisma.document.update({
      where: { id: docId },
      data: { status: "PROCESSING" },
    });

    // Fire Inngest event to start ingestion pipeline
    await inngest.send({
      name: "document.uploaded",
      data: { documentId: docId, projectId, uploadedById: user.id },
    });

    return NextResponse.json({ data: { status: "PROCESSING" } });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthError") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Document confirm error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
