// Notification service — in-app, email, Slack
// Implemented in later phases

export async function sendNotification(_params: {
  userId: string;
  type: string;
  title: string;
  message: string;
  projectId?: string;
}) {
  // TODO: Create in-app notification + email via SendGrid
  throw new Error("Not implemented");
}
