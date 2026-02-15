import { inngest } from "@/lib/inngest";

export const rfiAging = inngest.createFunction(
  { id: "rfi-aging" },
  { event: "rfi/aging-check" },
  async ({ event, step }) => {
    // TODO: Check for overdue RFIs and flag them
    await step.run("check-overdue", async () => {
      return { projectId: event.data.projectId };
    });
  }
);
