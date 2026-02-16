import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";
import { generateResponse } from "@/lib/ai";

// POST /api/projects/[projectId]/rfis/[rfiId]/analyze-response — AI analysis of RFI response
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

    if (!rfi.response) {
      return NextResponse.json(
        { error: "No response to analyze. Add a response to the RFI first." },
        { status: 400 }
      );
    }

    const systemPrompt = `You are an expert construction project analyst specializing in MEP (Mechanical, Electrical, Plumbing) contracts. Your job is to analyze RFI responses for completeness, potential change order implications, schedule impacts, and compliance concerns.

Provide a structured analysis with these sections:
1. **Completeness** — Does the response fully answer the question? Any gaps?
2. **Change Order Impact** — Does this response imply additional scope, cost, or changes? If yes, flag it and estimate impact (Low/Medium/High).
3. **Schedule Impact** — Any timeline implications from this response?
4. **Action Items** — What follow-up actions should the contractor take?
5. **Risk Assessment** — Any compliance, safety, or contractual risks identified?

Be concise but thorough. Use bullet points where appropriate.`;

    const userPrompt = `Analyze this RFI response:

RFI Number: ${rfi.rfiNumber}
Subject: ${rfi.subject}
Priority: ${rfi.priority}

Original Question:
${rfi.question}

Response Received:
${rfi.response}

Provide your structured analysis.`;

    const aiResponse = await generateResponse({
      systemPrompt,
      userPrompt,
      model: "sonnet",
      maxTokens: 2000,
      temperature: 0.3,
    });

    // Detect change order potential
    const analysisLower = aiResponse.content.toLowerCase();
    const coDetected =
      analysisLower.includes("change order") ||
      analysisLower.includes("additional scope") ||
      analysisLower.includes("additional cost") ||
      (analysisLower.includes("impact") && analysisLower.includes("high"));

    // Save the analysis and flag CO if detected
    const updateData: Record<string, unknown> = {
      aiResponseAnalysis: aiResponse.content,
    };
    if (coDetected && !rfi.coFlag) {
      updateData.coFlag = true;
    }

    const updated = await prisma.rFI.update({
      where: { id: rfiId },
      data: updateData,
    });

    return NextResponse.json({
      data: {
        analysis: aiResponse.content,
        coDetected,
        model: aiResponse.model,
        tokensUsed: aiResponse.tokensUsed,
        rfi: updated,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("AI response analysis error:", error);
    return NextResponse.json(
      { error: "Failed to analyze response" },
      { status: 500 }
    );
  }
}
