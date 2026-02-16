import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { getPresignedUploadUrl, buildR2Key, deleteFromR2 } from "@/lib/r2";
import { inngest } from "@/lib/inngest";
import { rateLimitGeneral } from "@/lib/rate-limit";

const uploadSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum([
    "SPEC", "DRAWING", "ADDENDUM", "RFI", "CONTRACT", "CHANGE",
    "COMPLIANCE", "MEETING", "FINANCIAL", "SCHEDULE", "CLOSEOUT", "PORTFOLIO",
  ]),
  mimeType: z.enum([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/png",
    "image/jpeg",
  ]),
  fileSize: z.number().int().positive().max(200 * 1024 * 1024), // 200MB max
  replace: z.boolean().optional(),
});

// POST — Request presigned upload URL
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
    const parsed = uploadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, type, mimeType, fileSize, replace } = parsed.data;

    // Verify project exists
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check for duplicate — same name and already READY or PROCESSING
    const existing = await prisma.document.findFirst({
      where: {
        projectId,
        name,
        status: { in: ["READY", "PROCESSING", "UPLOADING"] },
      },
      select: { id: true, name: true, status: true, updatedAt: true, r2Key: true },
    });

    if (existing) {
      if (replace) {
        // Delete old document (cascade handles chunks/embeddings)
        await prisma.document.delete({ where: { id: existing.id } });

        // Clean up old R2 file
        try {
          await deleteFromR2(existing.r2Key);
        } catch (r2Error) {
          console.error("R2 delete of replaced doc failed, queuing:", r2Error);
          await inngest.send({
            name: "document.r2-cleanup",
            data: { r2Key: existing.r2Key },
          });
        }
      } else {
        return NextResponse.json(
          {
            error: "duplicate",
            message: `"${name}" already exists in this project.`,
            existingDocument: existing,
          },
          { status: 409 }
        );
      }
    }

    // Create Document record
    const document = await prisma.document.create({
      data: {
        projectId,
        name,
        type,
        status: "UPLOADING",
        mimeType,
        fileSize,
        r2Key: "", // Set after we know the document ID
        uploadedById: user.id,
      },
    });

    // Build R2 key and update record
    const r2Key = buildR2Key(projectId, document.id, name);
    await prisma.document.update({
      where: { id: document.id },
      data: { r2Key },
    });

    // Generate presigned upload URL
    const uploadUrl = await getPresignedUploadUrl(r2Key, mimeType);

    return NextResponse.json({
      data: {
        documentId: document.id,
        uploadUrl,
        r2Key,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthError") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Document upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET — List documents for project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!rateLimitGeneral(user.id)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const { projectId } = await params;

    const documents = await prisma.document.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        mimeType: true,
        fileSize: true,
        pageCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ data: documents });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthError") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Document list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
