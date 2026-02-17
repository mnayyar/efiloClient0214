import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";
import { parseContract } from "@/services/compliance/parser";
import { downloadFromR2 } from "@/lib/r2";
import { extractText } from "@/services/document-processing";

const parseContractSchema = z.object({
  documentId: z.string().min(1, "documentId is required"),
  contractType: z
    .enum(["AIA_A201_2017", "AIA_A401_2017", "CONSENSUSDOCS_750", "CUSTOM"])
    .optional(),
});

// POST /api/projects/[projectId]/compliance/parse-contract
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

    const body = await request.json();
    const parsed = parseContractSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { documentId, contractType } = parsed.data;

    // Verify document exists and belongs to project
    const document = await prisma.document.findFirst({
      where: { id: documentId, projectId },
    });
    if (!document) {
      return NextResponse.json(
        { error: "Document not found in this project" },
        { status: 404 }
      );
    }

    if (document.status !== "READY") {
      return NextResponse.json(
        { error: "Document is not ready for parsing (still processing)" },
        { status: 400 }
      );
    }

    // Check for existing clauses from this document
    const existingClauses = await prisma.contractClause.count({
      where: { projectId, sourceDocId: documentId },
    });
    if (existingClauses > 0) {
      return NextResponse.json(
        {
          error: `This document already has ${existingClauses} extracted clauses. Delete them first to re-parse.`,
        },
        { status: 409 }
      );
    }

    // Download and extract text from the document
    const buffer = await downloadFromR2(document.r2Key);
    const extracted = await extractText(buffer, document.mimeType);

    if (!extracted.text || extracted.text.trim().length < 100) {
      return NextResponse.json(
        { error: "Document has insufficient text content for clause extraction" },
        { status: 400 }
      );
    }

    // Parse contract with AI
    const result = await parseContract({
      projectId,
      documentId,
      contractText: extracted.text,
      contractType,
      userId: user.id,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Parse contract error:", error);
    return NextResponse.json(
      { error: "Failed to parse contract" },
      { status: 500 }
    );
  }
}
