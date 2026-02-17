import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";
import { Prisma } from "@prisma/client";

const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  projectCode: z.string().min(1).max(50).optional(),
  type: z
    .enum([
      "COMMERCIAL",
      "INDUSTRIAL",
      "INSTITUTIONAL",
      "RESIDENTIAL",
      "INFRASTRUCTURE",
    ])
    .optional(),
  contractType: z
    .enum(["LUMP_SUM", "GMP", "COST_PLUS", "UNIT_PRICE", "TIME_AND_MATERIAL"])
    .nullish(),
  contractValue: z.number().positive().nullish(),
  status: z.string().min(1).max(50).optional(),
  gcCompanyName: z.string().max(255).nullish(),
  gcContactName: z.string().max(255).nullish(),
  gcContactEmail: z.string().email().max(255).nullish(),
  gcContactPhone: z.string().max(50).nullish(),
  architectName: z.string().max(255).nullish(),
  architectEmail: z.string().email().max(255).nullish(),
  architectPhone: z.string().max(50).nullish(),
  engineerName: z.string().max(255).nullish(),
  engineerEmail: z.string().email().max(255).nullish(),
  engineerPhone: z.string().max(50).nullish(),
  ownerName: z.string().max(255).nullish(),
  ownerEmail: z.string().email().max(255).nullish(),
  ownerPhone: z.string().max(50).nullish(),
});

// GET /api/projects/[projectId] — Fetch single project
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

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        _count: { select: { documents: true, rfis: true } },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: project });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Get project error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[projectId] — Update project
export async function PATCH(
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

    const existing = await prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = updateProjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.projectCode !== undefined)
      data.projectCode = parsed.data.projectCode.toUpperCase();
    if (parsed.data.type !== undefined) data.type = parsed.data.type;
    if (parsed.data.contractType !== undefined)
      data.contractType = parsed.data.contractType;
    if (parsed.data.contractValue !== undefined)
      data.contractValue = parsed.data.contractValue;
    if (parsed.data.status !== undefined) data.status = parsed.data.status;
    // Contact fields — pass through if present
    const contactFields = [
      "gcCompanyName", "gcContactName", "gcContactEmail", "gcContactPhone",
      "architectName", "architectEmail", "architectPhone",
      "engineerName", "engineerEmail", "engineerPhone",
      "ownerName", "ownerEmail", "ownerPhone",
    ] as const;
    for (const field of contactFields) {
      if (parsed.data[field] !== undefined) data[field] = parsed.data[field];
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ data: existing });
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data,
      include: {
        _count: { select: { documents: true, rfis: true } },
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A project with this code already exists." },
        { status: 409 }
      );
    }
    console.error("Update project error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
