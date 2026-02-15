import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateResponse } from "@/lib/ai";

const INITIAL_SUGGESTIONS_PROMPT = `You are a construction project assistant for efilo.ai. Based on the types and counts of documents indexed for a project, suggest 6 useful starting queries a project manager might ask.

Rules:
- Make suggestions specific and practical for construction project management.
- Cover different categories: compliance, specs, RFIs, financials, schedule, general.
- Keep each suggestion under 80 characters.
- Return a JSON array of objects with "text" and "category" fields.
- Categories: "compliance", "specs", "rfis", "financial", "schedule", "general"

Return ONLY valid JSON array, no explanation.`;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await requireAuth(request);
    const { projectId } = await params;

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    });
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Get document stats for the project
    const stats = await prisma.document.groupBy({
      by: ["type"],
      where: { projectId, status: "READY" },
      _count: true,
    });

    const totalDocs = stats.reduce((sum, s) => sum + s._count, 0);

    if (totalDocs === 0) {
      return NextResponse.json({
        data: {
          suggestions: [
            {
              text: "Upload documents to get started with AI search",
              category: "general",
            },
          ],
          documentStats: stats,
        },
      });
    }

    // Generate suggestions based on available document types
    const statsDescription = stats
      .map((s) => `${s.type}: ${s._count} documents`)
      .join(", ");

    try {
      const response = await generateResponse({
        model: "sonnet",
        maxTokens: 1000,
        temperature: 0.5,
        systemPrompt: INITIAL_SUGGESTIONS_PROMPT,
        userPrompt: `Project: ${project.name}\nIndexed documents: ${statsDescription}\nTotal: ${totalDocs} documents`,
      });

      const suggestions = JSON.parse(response.content);

      return NextResponse.json({
        data: {
          suggestions,
          documentStats: stats,
        },
      });
    } catch {
      // Fallback suggestions if AI generation fails
      return NextResponse.json({
        data: {
          suggestions: getDefaultSuggestions(stats.map((s) => s.type)),
          documentStats: stats,
        },
      });
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Suggestions error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function getDefaultSuggestions(
  availableTypes: string[]
): { text: string; category: string }[] {
  const suggestions: { text: string; category: string }[] = [];

  if (availableTypes.includes("SPEC")) {
    suggestions.push({
      text: "What are the key material specifications?",
      category: "specs",
    });
  }
  if (availableTypes.includes("CONTRACT")) {
    suggestions.push({
      text: "What are the major contract deadlines?",
      category: "compliance",
    });
  }
  if (availableTypes.includes("RFI")) {
    suggestions.push({
      text: "Show me all open RFIs and their status",
      category: "rfis",
    });
  }
  if (availableTypes.includes("ADDENDUM")) {
    suggestions.push({
      text: "What changes were made in the latest addendum?",
      category: "specs",
    });
  }
  if (availableTypes.includes("FINANCIAL")) {
    suggestions.push({
      text: "What is the current budget status?",
      category: "financial",
    });
  }
  if (availableTypes.includes("SCHEDULE")) {
    suggestions.push({
      text: "What milestones are coming up this month?",
      category: "schedule",
    });
  }

  // Always add a general suggestion
  suggestions.push({
    text: "Give me a project overview",
    category: "general",
  });

  return suggestions.slice(0, 6);
}
