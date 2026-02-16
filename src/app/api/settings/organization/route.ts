import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";

const updateOrgSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  billingEmail: z.string().email().optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color")
    .optional(),
  street: z.string().max(255).nullable().optional(),
  street2: z.string().max(255).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(100).nullable().optional(),
  zipCode: z.string().max(20).nullable().optional(),
  country: z.string().max(100).optional(),
  replyToDomain: z.string().max(255).nullable().optional(),
});

// GET /api/settings/organization — Fetch organization (admin only)
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!rateLimitGeneral(user.id)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const org = await prisma.organization.findFirst();
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json({ data: org });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Get organization error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/settings/organization — Update organization (admin only)
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!rateLimitGeneral(user.id)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const body = await request.json();
    const parsed = updateOrgSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const org = await prisma.organization.findFirst();
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const updated = await prisma.organization.update({
      where: { id: org.id },
      data: parsed.data,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Update organization error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
