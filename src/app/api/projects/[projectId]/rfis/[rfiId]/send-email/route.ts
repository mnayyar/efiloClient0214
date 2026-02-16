import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth";
import { rateLimitGeneral } from "@/lib/rate-limit";
import { sendRfiEmail } from "@/lib/email";

// POST /api/projects/[projectId]/rfis/[rfiId]/send-email
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

    // Fetch RFI
    const rfi = await prisma.rFI.findFirst({
      where: { id: rfiId, projectId },
    });

    if (!rfi) {
      return NextResponse.json({ error: "RFI not found" }, { status: 404 });
    }

    // Fetch project for GC contact
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    if (!project.gcContactEmail) {
      return NextResponse.json(
        { error: "No GC contact email configured on this project. Add one in Project Settings." },
        { status: 400 }
      );
    }

    // Fetch organization for no-reply email
    const org = await prisma.organization.findFirst();

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 500 }
      );
    }

    if (!org.replyToDomain) {
      return NextResponse.json(
        { error: "No-reply email not configured. Set it in Settings > Organization." },
        { status: 400 }
      );
    }

    // Send email
    await sendRfiEmail({
      fromName: `${user.name} via ${org.name}`,
      fromEmail: org.replyToDomain,
      replyTo: user.email,
      to: project.gcContactEmail,
      toName: project.gcContactName ?? undefined,
      rfiNumber: rfi.rfiNumber,
      subject: rfi.subject,
      question: rfi.question,
      projectName: project.name,
    });

    // Update RFI status to SUBMITTED
    const updated = await prisma.rFI.update({
      where: { id: rfiId },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });

    return NextResponse.json({
      data: { success: true, rfi: updated },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Send RFI email error:", error);
    return NextResponse.json(
      { error: "Failed to send RFI email" },
      { status: 500 }
    );
  }
}
