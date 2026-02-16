import { prisma } from "@/lib/db";

interface SendNotificationParams {
  userId: string;
  type: string;
  title: string;
  message: string;
  projectId?: string;
  entityId?: string;
  entityType?: string;
  severity?: "INFO" | "WARNING" | "CRITICAL";
}

/**
 * Create an in-app notification for a user.
 * Email/Slack channels to be added in later phases.
 */
export async function sendNotification(params: SendNotificationParams) {
  const notification = await prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type as never,
      severity: (params.severity ?? "INFO") as never,
      channel: "IN_APP" as never,
      title: params.title,
      message: params.message,
      projectId: params.projectId ?? null,
      entityId: params.entityId ?? null,
      entityType: params.entityType ?? null,
      read: false,
    },
  });

  // TODO: Email via SendGrid for WARNING/CRITICAL severity
  // TODO: Slack webhook for CRITICAL severity

  return notification;
}
