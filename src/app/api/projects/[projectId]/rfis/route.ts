import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";
import { Prisma, RFIStatus, RFIPriority } from "@prisma/client";

const createRfiSchema = z.object({
  subject: z.string().min(1, "Subject is required").max(500),
  question: z.string().min(1, "Question is required"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  assignedTo: z.string().max(255).optional(),
  dueDate: z.string().datetime().optional(),
  sourceDocIds: z.array(z.string()).optional(),
});

// GET /api/projects/[projectId]/rfis — List RFIs with optional filters
export async function GET(
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
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = { projectId };
    if (status && Object.values(RFIStatus).includes(status as RFIStatus)) {
      where.status = status;
    }
    if (priority && Object.values(RFIPriority).includes(priority as RFIPriority)) {
      where.priority = priority;
    }

    const rfis = await prisma.rFI.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: rfis });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("List RFIs error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/projects/[projectId]/rfis — Create a new RFI
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
    const parsed = createRfiSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Generate next RFI number for this project
    const lastRfi = await prisma.rFI.findFirst({
      where: { projectId },
      orderBy: { rfiNumber: "desc" },
      select: { rfiNumber: true },
    });

    const nextNumber = lastRfi
      ? String(parseInt(lastRfi.rfiNumber, 10) + 1).padStart(4, "0")
      : "0001";

    const { subject, question, priority, assignedTo, dueDate, sourceDocIds } = parsed.data;

    const rfi = await prisma.rFI.create({
      data: {
        projectId,
        rfiNumber: nextNumber,
        subject,
        question,
        priority,
        assignedTo: assignedTo || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        sourceDocIds: sourceDocIds ?? [],
        status: "DRAFT",
        createdById: user.id,
      },
    });

    return NextResponse.json({ data: rfi }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "An RFI with this number already exists in the project." },
        { status: 409 }
      );
    }
    console.error("Create RFI error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
