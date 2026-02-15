import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";
import { Prisma } from "@prisma/client";

const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  projectCode: z.string().min(1).max(50),
  type: z.enum([
    "COMMERCIAL",
    "INDUSTRIAL",
    "INSTITUTIONAL",
    "RESIDENTIAL",
    "INFRASTRUCTURE",
  ]),
  contractType: z
    .enum(["LUMP_SUM", "GMP", "COST_PLUS", "UNIT_PRICE", "TIME_AND_MATERIAL"])
    .optional(),
  contractValue: z.number().positive().optional(),
});

// GET /api/projects — List all projects
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    if (!rateLimitGeneral(user.id)) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    const projects = await prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { documents: true, rfis: true } },
      },
    });

    return NextResponse.json({ data: projects });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("List projects error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/projects — Create a new project
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    if (!rateLimitGeneral(user.id)) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = createProjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, projectCode, type, contractType, contractValue } =
      parsed.data;

    const project = await prisma.project.create({
      data: {
        name,
        projectCode: projectCode.toUpperCase(),
        type,
        contractType,
        contractValue,
        organizationId: user.organizationId,
      },
      include: {
        _count: { select: { documents: true, rfis: true } },
      },
    });

    return NextResponse.json({ data: project }, { status: 201 });
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
    console.error("Create project error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
