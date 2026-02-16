import { inngest } from "@/lib/inngest";
import { prisma } from "@/lib/db";

export const rfiAging = inngest.createFunction(
  { id: "rfi-aging" },
  { cron: "0 8 * * *" }, // Run daily at 8 AM
  async ({ step }) => {
    // Step 1: Find and flag overdue RFIs
    const overdueResults = await step.run("flag-overdue-rfis", async () => {
      const now = new Date();

      // Find RFIs that are past due but not yet flagged
      const overdueRfis = await prisma.rFI.findMany({
        where: {
          dueDate: { lt: now },
          isOverdue: false,
          status: { in: ["SUBMITTED", "PENDING_GC", "OPEN"] },
        },
        select: { id: true, projectId: true, rfiNumber: true, subject: true, createdById: true },
      });

      if (overdueRfis.length === 0) {
        return { flagged: 0, rfis: [] };
      }

      // Bulk update overdue flag
      await prisma.rFI.updateMany({
        where: { id: { in: overdueRfis.map((r) => r.id) } },
        data: { isOverdue: true },
      });

      return {
        flagged: overdueRfis.length,
        rfis: overdueRfis,
      };
    });

    // Step 2: Create overdue notifications
    if (overdueResults.flagged > 0) {
      await step.run("create-overdue-notifications", async () => {
        const notifications = overdueResults.rfis.map((rfi) => ({
          userId: rfi.createdById,
          type: "RFI_OVERDUE" as const,
          severity: "WARNING" as const,
          channel: "IN_APP" as const,
          title: `RFI ${rfi.rfiNumber} is overdue`,
          message: `"${rfi.subject}" has passed its response due date.`,
          projectId: rfi.projectId,
          entityId: rfi.id,
          entityType: "RFI",
          read: false,
        }));

        await prisma.notification.createMany({ data: notifications });

        return { notificationsCreated: notifications.length };
      });
    }

    // Step 3: Find RFIs approaching due date (within 2 days) and send reminders
    const approachingResults = await step.run("check-approaching-due", async () => {
      const now = new Date();
      const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

      const approachingRfis = await prisma.rFI.findMany({
        where: {
          dueDate: { gt: now, lte: twoDaysFromNow },
          isOverdue: false,
          status: { in: ["SUBMITTED", "PENDING_GC", "OPEN"] },
        },
        select: { id: true, projectId: true, rfiNumber: true, subject: true, dueDate: true, createdById: true },
      });

      if (approachingRfis.length === 0) {
        return { approaching: 0 };
      }

      // Check which ones already have a recent reminder (avoid duplicates)
      const recentReminders = await prisma.notification.findMany({
        where: {
          type: "RFI_RESPONSE_DUE",
          entityId: { in: approachingRfis.map((r) => r.id) },
          createdAt: { gt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
        select: { entityId: true },
      });

      const alreadyNotified = new Set(recentReminders.map((n) => n.entityId));
      const needsReminder = approachingRfis.filter((r) => !alreadyNotified.has(r.id));

      if (needsReminder.length > 0) {
        const notifications = needsReminder.map((rfi) => ({
          userId: rfi.createdById,
          type: "RFI_RESPONSE_DUE" as const,
          severity: "INFO" as const,
          channel: "IN_APP" as const,
          title: `RFI ${rfi.rfiNumber} response due soon`,
          message: `"${rfi.subject}" is due ${rfi.dueDate!.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`,
          projectId: rfi.projectId,
          entityId: rfi.id,
          entityType: "RFI",
          read: false,
        }));

        await prisma.notification.createMany({ data: notifications });
      }

      return { approaching: needsReminder.length };
    });

    return {
      overdueFlagged: overdueResults.flagged,
      approachingReminders: approachingResults.approaching,
    };
  }
);
