import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { documentIngestion } from "@/inngest/functions/document-ingestion";
import { rfiAging } from "@/inngest/functions/rfi-aging";
import { r2Cleanup } from "@/inngest/functions/r2-cleanup";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [documentIngestion, rfiAging, r2Cleanup],
});
