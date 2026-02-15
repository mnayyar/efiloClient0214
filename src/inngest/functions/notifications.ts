import { inngest } from "@/lib/inngest";

export const sendNotifications = inngest.createFunction(
  { id: "send-notifications" },
  { event: "notification/send" },
  async ({ event, step }) => {
    // TODO: Process and send notification via appropriate channel
    await step.run("send", async () => {
      return { notificationId: event.data.notificationId };
    });
  }
);
