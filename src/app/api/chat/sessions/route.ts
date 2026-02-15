import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/chat/sessions — List chat sessions for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const includeArchived = searchParams.get("includeArchived") === "true";

    const sessions = await prisma.chatSession.findMany({
      where: {
        userId: user.id,
        ...(projectId ? { projectId } : {}),
        ...(includeArchived ? {} : { isArchived: false }),
      },
      select: {
        id: true,
        title: true,
        projectId: true,
        isArchived: true,
        createdAt: true,
        updatedAt: true,
        project: {
          select: { id: true, name: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ data: sessions });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("List sessions error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
