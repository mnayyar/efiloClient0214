import { inngest } from "@/lib/inngest";
import {
  checkRfiCompliance,
  checkChangeEventCompliance,
} from "@/services/compliance/integrations";

/**
 * Triggered after RFI creation/update when CO flag is set.
 * Checks if compliance deadlines need to be created.
 */
export const complianceRfiCheck = inngest.createFunction(
  { id: "compliance-rfi-check", retries: 2 },
  { event: "compliance/rfi-check" },
  async ({ event, step }) => {
    const { rfiId, triggeredBy } = event.data as {
      rfiId: string;
      triggeredBy?: string;
    };

    const result = await step.run("check-rfi-compliance", async () => {
      return checkRfiCompliance(rfiId, triggeredBy);
    });

    return result;
  }
);

/**
 * Triggered after change event creation.
 * Checks if compliance deadlines need to be created.
 */
export const complianceChangeEventCheck = inngest.createFunction(
  { id: "compliance-change-event-check", retries: 2 },
  { event: "compliance/change-event-check" },
  async ({ event, step }) => {
    const { changeEventId, triggeredBy } = event.data as {
      changeEventId: string;
      triggeredBy?: string;
    };

    const result = await step.run(
      "check-change-event-compliance",
      async () => {
        return checkChangeEventCompliance(changeEventId, triggeredBy);
      }
    );

    return result;
  }
);
