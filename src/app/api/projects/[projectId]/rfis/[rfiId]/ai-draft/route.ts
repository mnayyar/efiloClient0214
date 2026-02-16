import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";
import { generateResponse } from "@/lib/ai";

// POST /api/projects/[projectId]/rfis/[rfiId]/ai-draft — Generate AI draft question
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; rfiId: string }> }
) {
  try {
    const user = await requireAuth(request);

    if (!rateLimitGeneral(user.id)) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    const { projectId, rfiId } = await params;

    const rfi = await prisma.rFI.findFirst({
      where: { id: rfiId, projectId },
    });

    if (!rfi) {
      return NextResponse.json({ error: "RFI not found" }, { status: 404 });
    }

    // Fetch linked documents for context
    let documentContext = "";
    if (rfi.sourceDocIds.length > 0) {
      const docs = await prisma.document.findMany({
        where: { id: { in: rfi.sourceDocIds } },
        select: { name: true, type: true },
      });
      documentContext = docs
        .map((d) => `- ${d.name} (${d.type})`)
        .join("\n");
    }

    const systemPrompt = `You are an expert construction project RFI (Request for Information) writer for MEP (Mechanical, Electrical, Plumbing) contractors. Your job is to take a rough subject and draft a clear, professional, and specific RFI question.

Construction RFI best practices:
- Be specific about the location, system, and scope
- Reference relevant specification sections or drawing numbers when possible
- Clearly state what information is needed and why
- Use professional construction industry language
- Keep the question focused on a single topic
- Include the impact on schedule/cost if the information is not provided promptly`;

    const userPrompt = `Draft a professional RFI question for the following subject:

Subject: ${rfi.subject}
${rfi.question ? `Current draft question: ${rfi.question}` : ""}
Priority: ${rfi.priority}
${rfi.assignedTo ? `Assigned to: ${rfi.assignedTo}` : ""}
${documentContext ? `\nReferenced documents:\n${documentContext}` : ""}

Write a clear, professional RFI question. Return ONLY the question text, no headers or labels.`;

    const aiResponse = await generateResponse({
      systemPrompt,
      userPrompt,
      model: "sonnet",
      maxTokens: 2000,
      temperature: 0.4,
    });

    // Save the AI draft to the RFI
    const updated = await prisma.rFI.update({
      where: { id: rfiId },
      data: {
        aiDraftQuestion: aiResponse.content,
        aiDraftModel: aiResponse.model,
      },
    });

    return NextResponse.json({
      data: {
        draft: aiResponse.content,
        model: aiResponse.model,
        tokensUsed: aiResponse.tokensUsed,
        rfi: updated,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("AI draft generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate AI draft" },
      { status: 500 }
    );
  }
}
