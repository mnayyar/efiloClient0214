import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";

const createUserSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  role: z.enum([
    "ADMIN",
    "PROJECT_MANAGER",
    "FIELD_ENGINEER",
    "ESTIMATOR",
    "EXECUTIVE",
    "VIEWER",
  ]),
  authMethod: z.enum(["SSO", "EMAIL_PASSWORD"]),
  password: z.string().min(8).optional(),
}).refine(
  (data) => data.authMethod !== "EMAIL_PASSWORD" || (data.password && data.password.length >= 8),
  { message: "Password is required for email/password users (min 8 characters)", path: ["password"] }
);

// GET /api/settings/users — List all users (admin only)
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!rateLimitGeneral(user.id)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        authMethod: true,
        avatar: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ data: users });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("List users error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/settings/users — Create a new user (admin only)
export async function POST(request: NextRequest) {
  try {
    const currentUser = await requireAuth(request);
    if (currentUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!rateLimitGeneral(currentUser.id)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const body = await request.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, email, role, authMethod, password } = parsed.data;

    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    }

    // Get the org
    const org = await prisma.organization.findFirst();
    if (!org) {
      return NextResponse.json({ error: "Organization not found." }, { status: 500 });
    }

    const passwordHash = authMethod === "EMAIL_PASSWORD" && password
      ? await hash(password, 12)
      : null;

    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        role,
        authMethod,
        passwordHash,
        organizationId: org.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        authMethod: true,
        avatar: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ data: user }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Create user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
