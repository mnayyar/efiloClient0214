import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getPool } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";
import { generateResponse } from "@/lib/ai";

const draftPreviewSchema = z.object({
  subject: z.string().min(1),
  question: z.string().default(""),
  priority: z.string().default("MEDIUM"),
  assignedTo: z.string().optional(),
  sourceDocIds: z.array(z.string()).default([]),
});

/**
 * Search for document chunks relevant to the RFI subject.
 * Uses keyword matching (ILIKE) to find chunks that mention terms from the subject.
 * Searches linked docs if provided, otherwise all project docs.
 */
async function findRelevantChunks(
  projectId: string,
  subject: string,
  question: string,
  sourceDocIds: string[]
) {
  const pool = getPool();

  // Build search terms from subject + question
  const searchText = `${subject} ${question}`.trim();
  const words = searchText
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .map((w) => w.replace(/[%_'"]/g, "")) // sanitize for LIKE
    .slice(0, 8); // cap at 8 keywords

  if (words.length === 0) return [];

  // Build WHERE clause: chunk must match at least one keyword
  const conditions = words.map((_, i) => `dc.content ILIKE $${i + 1}`);
  const params: unknown[] = words.map((w) => `%${w}%`);

  let docFilter = "";
  if (sourceDocIds.length > 0) {
    // Search within linked documents
    params.push(sourceDocIds);
    docFilter = `AND d.id = ANY($${params.length}::text[])`;
  } else {
    // Search all project documents
    params.push(projectId);
    docFilter = `AND d."projectId" = $${params.length}`;
  }

  const sql = `
    SELECT dc.content, dc."pageNumber", dc."sectionRef",
           d.name as "documentName", d.type as "documentType"
    FROM "DocumentChunk" dc
    JOIN "Document" d ON dc."documentId" = d.id
    WHERE d.status = 'READY'
      ${docFilter}
      AND (${conditions.join(" OR ")})
    ORDER BY
      CASE WHEN ${conditions.join(" AND ")} THEN 0
           WHEN ${conditions.slice(0, Math.ceil(conditions.length / 2)).join(" AND ")} THEN 1
           ELSE 2
      END,
      dc."pageNumber" ASC NULLS LAST
    LIMIT 20
  `;

  const result = await pool.query(sql, params);
  return result.rows as {
    content: string;
    pageNumber: number | null;
    sectionRef: string | null;
    documentName: string;
    documentType: string;
  }[];
}

// POST /api/projects/[projectId]/rfis/draft-preview — Generate AI draft without saving
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
    const body = await request.json();
    const parsed = draftPreviewSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { subject, question, priority, assignedTo, sourceDocIds } =
      parsed.data;

    // Find chunks relevant to the RFI subject
    const chunks = await findRelevantChunks(
      projectId,
      subject,
      question,
      sourceDocIds
    );

    let documentContext = "";
    if (chunks.length > 0) {
      documentContext =
        "ACTUAL PROJECT DOCUMENT EXCERPTS (use these as the source of truth):\n\n" +
        chunks
          .map(
            (c) =>
              `[${c.documentName}${c.pageNumber ? `, p.${c.pageNumber}` : ""}${c.sectionRef ? `, §${c.sectionRef}` : ""}]\n${c.content}`
          )
          .join("\n\n");
    }

    const systemPrompt = `You are an expert construction project RFI (Request for Information) writer for MEP (Mechanical, Electrical, Plumbing) contractors. Your job is to take a rough subject and draft a clear, professional, and well-formatted RFI question.

CRITICAL RULES:
1. You are provided with ACTUAL excerpts from the project documents. Extract and use real spec sections, drawing numbers, capacities, equipment tags, dates, and other specific values directly from these excerpts.
2. ONLY use [bracketed placeholders] for details that genuinely do not appear anywhere in the provided excerpts.
3. DO NOT fabricate or guess ANY specific detail. If it's in the excerpts, quote it. If it's not, use a placeholder.
4. Cite the document name and page/section when referencing specific facts from the excerpts.

OUTPUT FORMAT — use this markdown structure:
**Background:**
A brief paragraph describing the issue or context.

**References:**
- List the specific document references, spec sections, drawing numbers, and values from the project documents.

**Question:**
The specific, clear question requesting clarification or direction.

**Impact:**
A brief statement on the schedule/cost impact if not resolved promptly.`;

    const userPrompt = `Draft a professional RFI question for the following:

Subject: ${subject}
${question ? `Rough draft / notes: ${question}` : ""}
Priority: ${priority}
${assignedTo ? `Assigned to: ${assignedTo}` : ""}
${documentContext ? `\n${documentContext}` : "\nNo relevant document excerpts found. Use [bracketed placeholders] for all specific references."}

Write a well-formatted RFI using the markdown structure from your instructions. Pull real values from the document excerpts. Return ONLY the formatted RFI content.`;

    const aiResponse = await generateResponse({
      systemPrompt,
      userPrompt,
      model: "sonnet",
      maxTokens: 2000,
      temperature: 0.4,
    });

    return NextResponse.json({
      data: {
        draft: aiResponse.content,
        model: aiResponse.model,
        tokensUsed: aiResponse.tokensUsed,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("AI draft preview error:", error);
    return NextResponse.json(
      { error: "Failed to generate AI draft" },
      { status: 500 }
    );
  }
}
