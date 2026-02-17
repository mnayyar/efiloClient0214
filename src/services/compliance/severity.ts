import type { Severity } from "@prisma/client";
import { calculateDaysRemaining } from "./calculator";

interface SeverityResult {
  severity: Severity;
  color: string;
  label: string;
  channels: ("email" | "in_app")[];
  escalate: boolean;
}

/** Calculate severity based on days remaining until deadline. */
export function calculateSeverity(
  deadline: Date,
  now = new Date()
): SeverityResult {
  const daysRemaining = calculateDaysRemaining(deadline, now);

  if (daysRemaining < 0) {
    return {
      severity: "EXPIRED",
      color: "#DC2626",
      label: "EXPIRED",
      channels: ["email", "in_app"],
      escalate: true,
    };
  }

  if (daysRemaining <= 3) {
    return {
      severity: "CRITICAL",
      color: "#DC2626",
      label: `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} left`,
      channels: ["email", "in_app"],
      escalate: false,
    };
  }

  if (daysRemaining <= 7) {
    return {
      severity: "WARNING",
      color: "#C67F17",
      label: `${daysRemaining} days left`,
      channels: ["email", "in_app"],
      escalate: false,
    };
  }

  if (daysRemaining <= 14) {
    return {
      severity: "INFO",
      color: "#2563EB",
      label: `${daysRemaining} days left`,
      channels: ["in_app"],
      escalate: false,
    };
  }

  return {
    severity: "LOW",
    color: "#57534E",
    label: `${daysRemaining} days left`,
    channels: [],
    escalate: false,
  };
}

/** Get display properties for a severity level. */
export function getSeverityDisplay(severity: Severity): {
  color: string;
  bgColor: string;
} {
  switch (severity) {
    case "EXPIRED":
      return { color: "#DC2626", bgColor: "#FEE2E2" };
    case "CRITICAL":
      return { color: "#DC2626", bgColor: "#FEE2E2" };
    case "WARNING":
      return { color: "#C67F17", bgColor: "#FEF3C7" };
    case "INFO":
      return { color: "#2563EB", bgColor: "#DBEAFE" };
    case "LOW":
    default:
      return { color: "#57534E", bgColor: "#F5F5F4" };
  }
}

/** Determine if a deadline severity change should trigger an alert. */
export function shouldAlert(
  severity: Severity,
  lastAlertedAt?: Date,
  cooldownHours = 24
): boolean {
  if (severity === "EXPIRED") return true;

  if (lastAlertedAt) {
    const hoursSince =
      (Date.now() - lastAlertedAt.getTime()) / (1000 * 60 * 60);
    if (hoursSince < cooldownHours) return false;
  }

  return severity === "CRITICAL" || severity === "WARNING";
}
