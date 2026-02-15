import { inngest } from "@/lib/inngest";

export const complianceCheck = inngest.createFunction(
  { id: "compliance-check" },
  { event: "compliance/check-requested" },
  async ({ event, step }) => {
    // TODO: Check compliance deadlines and generate notices
    await step.run("check-deadlines", async () => {
      return { projectId: event.data.projectId };
    });
  }
);
