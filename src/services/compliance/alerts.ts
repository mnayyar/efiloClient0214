import { prisma } from "@/lib/db";
import { sendNotification } from "@/services/notifications";
import { sendEmail } from "@/lib/email";
import { calculateDaysRemaining } from "./calculator";
import type { Severity } from "@prisma/client";

/** Check all active CRITICAL/WARNING deadlines and send alerts. */
export async function checkDeadlinesForAlerts(): Promise<{
  alertsSent: number;
}> {
  const deadlines = await prisma.complianceDeadline.findMany({
    where: {
      status: "ACTIVE",
      severity: { in: ["CRITICAL", "WARNING", "EXPIRED"] },
    },
    include: {
      clause: { select: { title: true, sectionRef: true } },
    },
  });

  let alertsSent = 0;

  for (const deadline of deadlines) {
    const daysRemaining = calculateDaysRemaining(
      deadline.calculatedDeadline
    );
    const label =
      daysRemaining < 0
        ? "EXPIRED"
        : `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} remaining`;

    const title = `${deadline.severity}: ${deadline.clause.title}`;
    const message = `Notice due ${label} — ${deadline.clause.sectionRef || ""}. ${deadline.triggerDescription}`;

    // Get all users with relevant roles for this project's org
    const users = await prisma.user.findMany({
      where: {
        role: { in: ["ADMIN", "PROJECT_MANAGER", "EXECUTIVE"] },
      },
      select: { id: true, email: true, name: true },
    });

    for (const user of users) {
      // In-app notification
      await sendNotification({
        userId: user.id,
        type: "COMPLIANCE_DEADLINE",
        title,
        message,
        projectId: deadline.projectId,
        entityId: deadline.id,
        entityType: "ComplianceDeadline",
        severity: mapSeverity(deadline.severity),
      });

      // Email for CRITICAL and EXPIRED
      if (
        deadline.severity === "CRITICAL" ||
        deadline.severity === "EXPIRED"
      ) {
        await sendEmail({
          to: user.email,
          toName: user.name,
          subject: `[efilo] ${title}`,
          html: buildAlertEmailHtml(
            title,
            message,
            deadline.severity,
            deadline.calculatedDeadline
          ),
          text: `${title}\n\n${message}\n\nDeadline: ${deadline.calculatedDeadline.toLocaleDateString()}`,
        });
      }

      alertsSent++;
    }
  }

  return { alertsSent };
}

/** Send weekly compliance summary to project team. */
export async function sendWeeklyComplianceSummary(
  projectId: string
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  });
  if (!project) return;

  // Get latest score
  const score = await prisma.complianceScore.findFirst({
    where: { projectId },
    orderBy: { calculatedAt: "desc" },
  });

  // Get upcoming deadlines
  const upcoming = await prisma.complianceDeadline.findMany({
    where: {
      projectId,
      status: "ACTIVE",
      calculatedDeadline: {
        lte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    },
    include: { clause: { select: { title: true, sectionRef: true } } },
    orderBy: { calculatedDeadline: "asc" },
    take: 10,
  });

  const percentage = score
    ? score.totalCount > 0
      ? `${((score.onTimeCount / score.totalCount) * 100).toFixed(0)}%`
      : "N/A"
    : "N/A";

  const deadlineLines = upcoming
    .map((d) => {
      const days = calculateDaysRemaining(d.calculatedDeadline);
      const sev = days <= 3 ? "CRITICAL" : days <= 7 ? "WARNING" : "INFO";
      return `[${sev}] ${d.clause.title} (${d.clause.sectionRef || "N/A"}) — ${days} days`;
    })
    .join("\n");

  const text = `Weekly Compliance Summary — ${project.name}

PERFORMANCE
- Compliance Score: ${percentage} (${score?.onTimeCount ?? 0}/${score?.totalCount ?? 0} on time)
- Current Streak: ${score?.currentStreak ?? 0} consecutive
- Claims Protected: $${score ? Number(score.protectedClaimsValue).toLocaleString() : "0"}

UPCOMING DEADLINES (Next 14 Days)
${deadlineLines || "No upcoming deadlines."}`;

  const users = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "PROJECT_MANAGER", "EXECUTIVE"] } },
    select: { email: true, name: true },
  });

  for (const user of users) {
    await sendEmail({
      to: user.email,
      toName: user.name,
      subject: `[efilo] Weekly Compliance Summary — ${project.name}`,
      html: `<pre style="font-family: 'DM Sans', sans-serif; white-space: pre-wrap; max-width: 600px; line-height: 1.6;">${escapeHtml(text)}</pre>`,
      text,
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function mapSeverity(
  s: Severity
): "INFO" | "WARNING" | "CRITICAL" {
  if (s === "CRITICAL" || s === "EXPIRED") return "CRITICAL";
  if (s === "WARNING") return "WARNING";
  return "INFO";
}

function buildAlertEmailHtml(
  title: string,
  message: string,
  severity: Severity,
  deadline: Date
): string {
  const color =
    severity === "EXPIRED" || severity === "CRITICAL"
      ? "#DC2626"
      : severity === "WARNING"
        ? "#C67F17"
        : "#2563EB";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1C1917; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="border-left: 4px solid ${color}; padding-left: 16px; margin-bottom: 24px;">
    <h2 style="margin: 0; color: ${color};">${escapeHtml(title)}</h2>
  </div>
  <p style="font-size: 15px; line-height: 1.6;">${escapeHtml(message)}</p>
  <p style="font-size: 14px; color: #57534E; margin-top: 16px;">
    Deadline: <strong>${deadline.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</strong>
  </p>
  <p style="color: #57534E; font-size: 12px; margin-top: 24px;">
    Log in to efilo to draft and send the required notice.
  </p>
</body>
</html>`.trim();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
