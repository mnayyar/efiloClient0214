import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";
import { uploadToR2, deleteFromR2 } from "@/lib/r2";

const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/webp",
];
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

function extFromMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/svg+xml":
      return "svg";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

// POST /api/settings/organization/logo — Upload logo (admin only)
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!rateLimitGeneral(user.id)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: PNG, JPEG, SVG, WebP" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 2 MB." },
        { status: 400 }
      );
    }

    const org = await prisma.organization.findFirst();
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const ext = extFromMime(file.type);
    const r2Key = `org/logo/logo.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await uploadToR2(r2Key, buffer, file.type);

    const publicUrl = process.env.R2_PUBLIC_URL
      ? `${process.env.R2_PUBLIC_URL}/${r2Key}`
      : r2Key;

    const updated = await prisma.organization.update({
      where: { id: org.id },
      data: { logo: publicUrl },
    });

    return NextResponse.json({ data: { logo: updated.logo } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Upload logo error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/settings/organization/logo — Remove logo (admin only)
export async function DELETE(request: NextRequest) {
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

    if (org.logo) {
      // Extract R2 key from the full URL
      const r2Key = org.logo.includes("/org/logo/")
        ? org.logo.substring(org.logo.indexOf("org/logo/"))
        : org.logo;

      try {
        await deleteFromR2(r2Key);
      } catch (e) {
        console.warn("Failed to delete logo from R2 (may not exist):", e);
      }
    }

    await prisma.organization.update({
      where: { id: org.id },
      data: { logo: null },
    });

    return NextResponse.json({ data: { logo: null } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Delete logo error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
