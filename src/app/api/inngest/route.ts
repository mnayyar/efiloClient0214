import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { documentIngestion } from "@/inngest/functions/document-ingestion";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [documentIngestion],
});
