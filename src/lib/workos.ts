import { WorkOS } from "@workos-inc/node";
import { prisma } from "@/lib/db";

export const workos = new WorkOS(process.env.WORKOS_API_KEY!);

export const WORKOS_CLIENT_ID = process.env.WORKOS_CLIENT_ID!;
export const WORKOS_REDIRECT_URI = process.env.WORKOS_REDIRECT_URI!;

interface WorkOSUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export class UserNotFoundError extends Error {
  constructor() {
    super("User not authorized");
    this.name = "UserNotFoundError";
  }
}

/**
 * Look up an existing User by email from a WorkOS SSO login.
 * Only pre-approved users (created by admin) can log in.
 * Throws UserNotFoundError if the email doesn't exist in the database.
 */
export async function getOrCreateUser(workosUser: WorkOSUser) {
  const user = await prisma.user.findUnique({
    where: { email: workosUser.email },
  });

  if (!user) {
    throw new UserNotFoundError();
  }

  // Update WorkOS ID, name, and last login
  const name = [workosUser.firstName, workosUser.lastName]
    .filter(Boolean)
    .join(" ") || workosUser.email;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      workosUserId: workosUser.id,
      name,
      lastLoginAt: new Date(),
    },
  });

  return updated;
}

/**
 * Look up a user by their internal ID.
 */
export async function getUserById(userId: string) {
  return prisma.user.findUnique({ where: { id: userId } });
}
