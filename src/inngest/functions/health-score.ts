import { inngest } from "@/lib/inngest";

export const healthScore = inngest.createFunction(
  { id: "health-score" },
  { event: "health/calculate" },
  async ({ event, step }) => {
    // TODO: Calculate project health score
    await step.run("calculate-score", async () => {
      return { projectId: event.data.projectId };
    });
  }
);
