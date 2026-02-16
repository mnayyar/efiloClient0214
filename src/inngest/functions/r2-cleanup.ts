import { inngest } from "@/lib/inngest";
import { deleteFromR2 } from "@/lib/r2";

/**
 * Deferred R2 cleanup — retries R2 file deletion when the inline attempt fails.
 * Fires when the DELETE endpoint can't reach R2 but has already removed the DB record.
 */
export const r2Cleanup = inngest.createFunction(
  {
    id: "r2-cleanup",
    retries: 5, // Inngest exponential backoff across 5 attempts
  },
  { event: "document.r2-cleanup" },
  async ({ event, step }) => {
    const { r2Key } = event.data as { r2Key: string };

    await step.run("delete-r2-object", async () => {
      await deleteFromR2(r2Key);
    });

    return { r2Key, cleaned: true };
  }
);
