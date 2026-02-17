import { inngest } from "@/lib/inngest";
import { prisma } from "@/lib/db";
import { updateAllDeadlineSeverities } from "@/services/compliance/deadlines";
import { saveScoreSnapshot } from "@/services/compliance/scoring";
import { checkDeadlinesForAlerts, sendWeeklyComplianceSummary } from "@/services/compliance/alerts";

/** Hourly cron: refresh deadline severities, mark expired, send alerts. */
export const complianceSeverityCron = inngest.createFunction(
  {
    id: "compliance-severity-cron",
    retries: 2,
  },
  { cron: "0 * * * *" }, // Every hour
  async ({ step }) => {
    const result = await step.run("update-severities", async () => {
      return updateAllDeadlineSeverities();
    });

    const alerts = await step.run("send-alerts", async () => {
      return checkDeadlinesForAlerts();
    });

    return {
      updated: result.updated,
      expired: result.expired,
      alertsSent: alerts.alertsSent,
    };
  }
);

/** On-demand: check deadlines for a specific project. */
export const complianceCheck = inngest.createFunction(
  { id: "compliance-check", retries: 2 },
  { event: "compliance/check-requested" },
  async ({ event, step }) => {
    const { projectId } = event.data as { projectId: string };

    const result = await step.run("update-severities", async () => {
      return updateAllDeadlineSeverities();
    });

    return { projectId, ...result };
  }
);

/** Daily cron: snapshot compliance scores for all projects (runs at 2 AM). */
export const complianceDailySnapshot = inngest.createFunction(
  {
    id: "compliance-daily-snapshot",
    retries: 2,
  },
  { cron: "0 2 * * *" }, // 2 AM daily
  async ({ step }) => {
    const projects = await step.run("get-projects", async () => {
      const all = await prisma.project.findMany({
        where: { status: "ACTIVE" },
        select: { id: true },
      });
      return all.map((p) => p.id);
    });

    let snapshotCount = 0;
    for (const projectId of projects) {
      await step.run(`snapshot-${projectId}`, async () => {
        await saveScoreSnapshot(projectId, "daily");
      });
      snapshotCount++;
    }

    return { snapshotCount };
  }
);

/** Weekly cron: send compliance summary emails (runs Monday 8 AM). */
export const complianceWeeklySummary = inngest.createFunction(
  {
    id: "compliance-weekly-summary",
    retries: 2,
  },
  { cron: "0 8 * * 1" }, // Monday 8 AM
  async ({ step }) => {
    const projects = await step.run("get-projects", async () => {
      const all = await prisma.project.findMany({
        where: { status: "ACTIVE" },
        select: { id: true },
      });
      return all.map((p) => p.id);
    });

    let summariesSent = 0;
    for (const projectId of projects) {
      await step.run(`summary-${projectId}`, async () => {
        await sendWeeklyComplianceSummary(projectId);
        await saveScoreSnapshot(projectId, "weekly");
      });
      summariesSent++;
    }

    return { summariesSent };
  }
);
