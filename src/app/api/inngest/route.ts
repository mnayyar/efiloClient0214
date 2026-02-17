import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { documentIngestion } from "@/inngest/functions/document-ingestion";
import { rfiAging } from "@/inngest/functions/rfi-aging";
import { r2Cleanup } from "@/inngest/functions/r2-cleanup";
import {
  complianceCheck,
  complianceSeverityCron,
  complianceDailySnapshot,
  complianceWeeklySummary,
} from "@/inngest/functions/compliance-check";
import {
  complianceRfiCheck,
  complianceChangeEventCheck,
} from "@/inngest/functions/compliance-integration";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    documentIngestion,
    rfiAging,
    r2Cleanup,
    complianceCheck,
    complianceSeverityCron,
    complianceDailySnapshot,
    complianceWeeklySummary,
    complianceRfiCheck,
    complianceChangeEventCheck,
  ],
});
