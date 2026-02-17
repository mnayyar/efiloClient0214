import { prisma } from "@/lib/db";
import { generateResponse } from "@/lib/ai";
import { sendEmail } from "@/lib/email";
import {
  NOTICE_LETTER_SYSTEM_PROMPT,
  buildNoticeLetterPrompt,
  type NoticeLetterContext,
} from "./prompts";
import type {
  ComplianceNotice,
  ComplianceNoticeType,
  ComplianceNoticeStatus,
  ContractClauseMethod,
} from "@prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────

interface CreateNoticeParams {
  projectId: string;
  deadlineId: string;
  clauseId: string;
  recipientName: string;
  recipientEmail?: string;
  generateWithAI?: boolean;
  createdById: string;
}

interface DeliveryConfirmation {
  email?: {
    sentAt: string;
    status: string;
    deliveredAt?: string;
  };
  certifiedMail?: {
    sentAt: string;
    trackingNumber: string;
    carrier: string;
    status: string;
    deliveredAt?: string;
    signedBy?: string;
  };
  handDelivery?: {
    deliveredAt: string;
    receivedBy: string;
  };
  courier?: {
    sentAt: string;
    trackingNumber: string;
    carrier: string;
    status: string;
    deliveredAt?: string;
  };
}

// ── Map clause kind → notice type ─────────────────────────────────────────

const CLAUSE_TO_NOTICE_TYPE: Record<string, ComplianceNoticeType> = {
  CLAIMS_PROCEDURE: "CLAIM_NOTICE",
  CHANGE_ORDER_PROCESS: "CHANGE_ORDER_NOTICE",
  TERMINATION: "TERMINATION_NOTICE",
  WARRANTY: "WARRANTY_NOTICE",
  NOTICE_REQUIREMENTS: "CLAIM_NOTICE",
  DISPUTE_RESOLUTION: "CLAIM_NOTICE",
  PAYMENT_TERMS: "NOTICE_TO_PROCEED",
  RETENTION: "LIEN_NOTICE",
};

function clauseKindToNoticeType(kind: string): ComplianceNoticeType {
  return CLAUSE_TO_NOTICE_TYPE[kind] || "CLAIM_NOTICE";
}

// ── Map clause noticeMethod → delivery methods ────────────────────────────

function noticeMethodToDeliveryMethods(
  method: ContractClauseMethod | null
): string[] {
  switch (method) {
    case "CERTIFIED_MAIL":
      return ["CERTIFIED_MAIL", "EMAIL"];
    case "REGISTERED_MAIL":
      return ["REGISTERED_MAIL", "EMAIL"];
    case "HAND_DELIVERY":
      return ["HAND_DELIVERY", "EMAIL"];
    case "EMAIL":
      return ["EMAIL"];
    case "WRITTEN_NOTICE":
      return ["EMAIL", "CERTIFIED_MAIL"];
    default:
      return ["EMAIL", "CERTIFIED_MAIL"];
  }
}

// ── Create Notice ─────────────────────────────────────────────────────────

export async function createNotice(
  params: CreateNoticeParams
): Promise<ComplianceNotice> {
  const {
    projectId,
    deadlineId,
    clauseId,
    recipientName,
    recipientEmail,
    generateWithAI = true,
    createdById,
  } = params;

  // Fetch clause + deadline + project + org (validate project ownership)
  const clause = await prisma.contractClause.findFirst({
    where: { id: clauseId, projectId },
  });
  if (!clause) throw new Error("Clause not found in this project");

  const deadline = await prisma.complianceDeadline.findFirst({
    where: { id: deadlineId, projectId },
  });
  if (!deadline) throw new Error("Deadline not found in this project");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { organization: { select: { name: true } } },
  });
  if (!project) throw new Error("Project not found");

  // Generate letter content with AI
  let content = "";
  let aiModel: string | null = null;

  if (generateWithAI) {
    const ctx: NoticeLetterContext = {
      sectionRef: clause.sectionRef,
      clauseKind: clause.kind,
      clauseTitle: clause.title,
      deadlineDays: clause.deadlineDays ?? 0,
      deadlineType: clause.deadlineType ?? "CALENDAR_DAYS",
      trigger: clause.trigger,
      noticeMethod: clause.noticeMethod,
      triggerEventType: deadline.triggerEventType,
      triggerDescription: deadline.triggerDescription,
      eventDate: deadline.triggeredAt.toISOString().split("T")[0],
      projectName: project.name,
      orgName: project.organization.name,
      recipientName,
      recipientEmail: recipientEmail ?? undefined,
    };

    const aiResponse = await generateResponse({
      systemPrompt: NOTICE_LETTER_SYSTEM_PROMPT,
      userPrompt: buildNoticeLetterPrompt(ctx),
      model: "sonnet",
      maxTokens: 2048,
      temperature: 0.2,
    });

    content = aiResponse.content;
    aiModel = aiResponse.model;
  }

  const noticeType = clauseKindToNoticeType(clause.kind);
  const deliveryMethods = noticeMethodToDeliveryMethods(clause.noticeMethod);

  // Create notice
  const notice = await prisma.complianceNotice.create({
    data: {
      projectId,
      type: noticeType,
      status: "DRAFT",
      title: `${clause.title} — ${clause.sectionRef || "Notice"}`,
      content,
      recipientName,
      recipientEmail: recipientEmail || null,
      dueDate: deadline.calculatedDeadline,
      clauseId,
      deliveryMethods,
      generatedByAI: generateWithAI,
      aiModel,
      createdById,
    },
  });

  // Link notice to deadline
  await prisma.complianceDeadline.update({
    where: { id: deadlineId },
    data: {
      status: "NOTICE_DRAFTED",
      noticeId: notice.id,
      noticeCreatedAt: new Date(),
    },
  });

  // Audit log
  await prisma.complianceAuditLog.create({
    data: {
      projectId,
      eventType: "NOTICE_DRAFTED",
      entityType: "ComplianceNotice",
      entityId: notice.id,
      userId: createdById,
      actorType: generateWithAI ? "AI" : "USER",
      action: "created",
      details: JSON.parse(
        JSON.stringify({
          sectionRef: clause.sectionRef,
          noticeType,
          generatedByAI: generateWithAI,
          deliveryMethods,
        })
      ),
    },
  });

  return notice;
}

// ── Regenerate Letter ─────────────────────────────────────────────────────

export async function regenerateNoticeLetter(
  noticeId: string,
  customInstructions?: string
): Promise<{ content: string }> {
  const notice = await prisma.complianceNotice.findUnique({
    where: { id: noticeId },
  });
  if (!notice) throw new Error("Notice not found");
  if (!notice.clauseId) throw new Error("Notice has no linked clause");

  const clause = await prisma.contractClause.findUnique({
    where: { id: notice.clauseId },
  });
  if (!clause) throw new Error("Clause not found");

  // Find linked deadline
  const deadline = await prisma.complianceDeadline.findFirst({
    where: { noticeId },
  });

  const project = await prisma.project.findUnique({
    where: { id: notice.projectId },
    include: { organization: { select: { name: true } } },
  });

  const ctx: NoticeLetterContext = {
    sectionRef: clause.sectionRef,
    clauseKind: clause.kind,
    clauseTitle: clause.title,
    deadlineDays: clause.deadlineDays ?? 0,
    deadlineType: clause.deadlineType ?? "CALENDAR_DAYS",
    trigger: clause.trigger,
    noticeMethod: clause.noticeMethod,
    triggerEventType: deadline?.triggerEventType ?? "OTHER",
    triggerDescription:
      deadline?.triggerDescription ?? "See attached documentation",
    eventDate:
      deadline?.triggeredAt.toISOString().split("T")[0] ??
      new Date().toISOString().split("T")[0],
    projectName: project?.name ?? "[PROJECT NAME]",
    orgName: project?.organization.name ?? "[ORGANIZATION]",
    recipientName: notice.recipientName ?? "[RECIPIENT]",
    recipientEmail: notice.recipientEmail ?? undefined,
  };

  let prompt = buildNoticeLetterPrompt(ctx);
  if (customInstructions) {
    prompt += `\n\nADDITIONAL INSTRUCTIONS: ${customInstructions}`;
  }

  const aiResponse = await generateResponse({
    systemPrompt: NOTICE_LETTER_SYSTEM_PROMPT,
    userPrompt: prompt,
    model: "sonnet",
    maxTokens: 2048,
    temperature: 0.2,
  });

  await prisma.complianceNotice.update({
    where: { id: noticeId },
    data: {
      content: aiResponse.content,
      generatedByAI: true,
      aiModel: aiResponse.model,
    },
  });

  return { content: aiResponse.content };
}

// ── Update Notice Content ─────────────────────────────────────────────────

export async function updateNoticeContent(
  noticeId: string,
  content: string,
  userId: string
): Promise<ComplianceNotice> {
  const notice = await prisma.complianceNotice.update({
    where: { id: noticeId },
    data: {
      content,
      reviewedBy: userId,
      reviewedAt: new Date(),
    },
  });

  await prisma.complianceAuditLog.create({
    data: {
      projectId: notice.projectId,
      eventType: "NOTICE_EDITED",
      entityType: "ComplianceNotice",
      entityId: noticeId,
      userId,
      actorType: "USER",
      action: "updated",
      details: JSON.parse(JSON.stringify({ field: "content" })),
    },
  });

  return notice;
}

// ── Send Notice ───────────────────────────────────────────────────────────

export async function sendNotice(
  noticeId: string,
  methods: string[],
  userId: string
): Promise<{ sentMethods: string[]; failedMethods: string[] }> {
  const notice = await prisma.complianceNotice.findUnique({
    where: { id: noticeId },
  });
  if (!notice) throw new Error("Notice not found");

  // Fetch user + org for email sender info
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const project = await prisma.project.findUnique({
    where: { id: notice.projectId },
  });

  const org = await prisma.organization.findFirst();

  // Determine GC contact email — prefer project-level, fall back to notice recipient
  const toEmail = project?.gcContactEmail || notice.recipientEmail;
  const toName = project?.gcContactName || notice.recipientName;

  const sentMethods: string[] = [];
  const failedMethods: string[] = [];
  const confirmation: DeliveryConfirmation = {};

  for (const method of methods) {
    try {
      if (method === "EMAIL" && toEmail) {
        const fromEmail = org?.replyToDomain || "noreply@efilo.ai";
        const fromName = `${user.name} via ${org?.name || "efilo.ai"}`;

        await sendEmail({
          to: toEmail,
          toName: toName ?? undefined,
          from: fromEmail,
          fromName,
          replyTo: user.email,
          cc: user.email,
          subject: `NOTICE: ${notice.title}`,
          html: `<pre style="font-family: 'DM Sans', sans-serif; white-space: pre-wrap; max-width: 700px;">${escapeHtml(notice.content)}</pre>`,
          text: notice.content,
        });
        confirmation.email = {
          sentAt: new Date().toISOString(),
          status: "sent",
        };
        sentMethods.push(method);
      } else if (method === "CERTIFIED_MAIL") {
        // Manual tracking — user enters tracking number later
        confirmation.certifiedMail = {
          sentAt: new Date().toISOString(),
          trackingNumber: "PENDING_USER_INPUT",
          carrier: "USPS",
          status: "pending",
        };
        sentMethods.push(method);
      } else if (method === "HAND_DELIVERY") {
        confirmation.handDelivery = {
          deliveredAt: "PENDING_CONFIRMATION",
          receivedBy: "PENDING_CONFIRMATION",
        };
        sentMethods.push(method);
      } else if (method === "COURIER") {
        confirmation.courier = {
          sentAt: new Date().toISOString(),
          trackingNumber: "PENDING_USER_INPUT",
          carrier: "PENDING_USER_INPUT",
          status: "pending",
        };
        sentMethods.push(method);
      } else {
        // REGISTERED_MAIL, FAX, etc. — track as pending
        sentMethods.push(method);
      }
    } catch (error) {
      console.error(`Failed to send via ${method}:`, error);
      failedMethods.push(method);
    }
  }

  const newStatus: ComplianceNoticeStatus =
    sentMethods.length > 0 ? "SENT" : "DRAFT";

  await prisma.complianceNotice.update({
    where: { id: noticeId },
    data: {
      status: newStatus,
      sentAt: sentMethods.length > 0 ? new Date() : null,
      deliveryConfirmation: JSON.parse(JSON.stringify(confirmation)),
      deliveryMethods: sentMethods,
    },
  });

  // Update linked deadline status
  if (sentMethods.length > 0) {
    const deadline = await prisma.complianceDeadline.findFirst({
      where: { noticeId },
    });
    if (deadline) {
      await prisma.complianceDeadline.update({
        where: { id: deadline.id },
        data: { status: "NOTICE_SENT" },
      });
    }
  }

  await prisma.complianceAuditLog.create({
    data: {
      projectId: notice.projectId,
      eventType: "NOTICE_SENT",
      entityType: "ComplianceNotice",
      entityId: noticeId,
      userId,
      actorType: "USER",
      action: "sent",
      details: JSON.parse(JSON.stringify({ sentMethods, failedMethods })),
    },
  });

  return { sentMethods, failedMethods };
}

// ── Confirm Delivery ──────────────────────────────────────────────────────

interface ConfirmDeliveryParams {
  method: string;
  trackingNumber?: string;
  carrier?: string;
  deliveredAt?: string;
  signedBy?: string;
  receivedBy?: string;
}

export async function confirmDelivery(
  noticeId: string,
  params: ConfirmDeliveryParams,
  userId: string
): Promise<ComplianceNotice> {
  const notice = await prisma.complianceNotice.findUnique({
    where: { id: noticeId },
  });
  if (!notice) throw new Error("Notice not found");

  const existing =
    (notice.deliveryConfirmation as DeliveryConfirmation | null) || {};
  const now = new Date().toISOString();

  switch (params.method) {
    case "EMAIL":
      existing.email = {
        ...existing.email!,
        status: "delivered",
        deliveredAt: params.deliveredAt || now,
      };
      break;
    case "CERTIFIED_MAIL":
      existing.certifiedMail = {
        sentAt: existing.certifiedMail?.sentAt || now,
        trackingNumber: params.trackingNumber || "",
        carrier: params.carrier || "USPS",
        status: "delivered",
        deliveredAt: params.deliveredAt || now,
        signedBy: params.signedBy,
      };
      break;
    case "HAND_DELIVERY":
      existing.handDelivery = {
        deliveredAt: params.deliveredAt || now,
        receivedBy: params.receivedBy || "",
      };
      break;
    case "COURIER":
      existing.courier = {
        sentAt: existing.courier?.sentAt || now,
        trackingNumber: params.trackingNumber || "",
        carrier: params.carrier || "",
        status: "delivered",
        deliveredAt: params.deliveredAt || now,
      };
      break;
  }

  // Check if all methods are fully confirmed
  const allDelivered = notice.deliveryMethods.every((m) => {
    switch (m) {
      case "EMAIL":
        return existing.email?.status === "delivered";
      case "CERTIFIED_MAIL":
        return existing.certifiedMail?.status === "delivered";
      case "HAND_DELIVERY":
        return (
          existing.handDelivery?.receivedBy !== undefined &&
          existing.handDelivery.receivedBy !== "PENDING_CONFIRMATION"
        );
      case "COURIER":
        return existing.courier?.status === "delivered";
      default:
        return true;
    }
  });

  const onTimeStatus =
    allDelivered && notice.sentAt && notice.dueDate
      ? notice.sentAt <= notice.dueDate
      : null;

  const newStatus: ComplianceNoticeStatus = allDelivered
    ? "ACKNOWLEDGED"
    : "SENT";

  const updated = await prisma.complianceNotice.update({
    where: { id: noticeId },
    data: {
      deliveryConfirmation: JSON.parse(JSON.stringify(existing)),
      status: newStatus,
      deliveredAt: allDelivered ? new Date() : null,
      onTimeStatus,
    },
  });

  // Mark deadline as completed if all delivered
  if (allDelivered) {
    const deadline = await prisma.complianceDeadline.findFirst({
      where: { noticeId },
    });
    if (deadline) {
      await prisma.complianceDeadline.update({
        where: { id: deadline.id },
        data: { status: "COMPLETED" },
      });
    }
  }

  await prisma.complianceAuditLog.create({
    data: {
      projectId: notice.projectId,
      eventType: "DELIVERY_CONFIRMED",
      entityType: "ComplianceNotice",
      entityId: noticeId,
      userId,
      actorType: "USER",
      action: "delivery_confirmed",
      details: JSON.parse(
        JSON.stringify({
          method: params.method,
          allDelivered,
          onTimeStatus,
        })
      ),
    },
  });

  return updated;
}

// ── Query ─────────────────────────────────────────────────────────────────

export async function getProjectNotices(
  projectId: string,
  filters?: {
    type?: ComplianceNoticeType;
    status?: ComplianceNoticeStatus;
  }
) {
  return prisma.complianceNotice.findMany({
    where: {
      projectId,
      ...(filters?.type && { type: filters.type }),
      ...(filters?.status && { status: filters.status }),
    },
    orderBy: { createdAt: "desc" },
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
