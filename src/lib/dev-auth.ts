import { prisma } from "@/lib/db";
import { createSessionToken, setSessionCookie } from "@/lib/session";

const IS_DEV_BYPASS =
  process.env.ENVIRONMENT === "development" &&
  (!process.env.WORKOS_API_KEY || process.env.WORKOS_API_KEY === "sk_live_...");

/**
 * Returns true if dev auth bypass is active
 * (ENVIRONMENT=development and no real WorkOS key).
 */
export function isDevBypass(): boolean {
  return IS_DEV_BYPASS;
}

/**
 * Get or create the dev seed user and set the session cookie.
 * Call this from the SSO route when dev bypass is active.
 */
export async function devLogin() {
  // Ensure org exists
  let org = await prisma.organization.findFirst();
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: "Dev Organization",
        slug: "dev-org",
        billingEmail: "dev@efilo.ai",
      },
    });
  }

  // Ensure dev user exists
  let user = await prisma.user.findUnique({
    where: { email: "dev@efilo.ai" },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: "dev@efilo.ai",
        name: "Dev User",
        role: "ADMIN",
        organizationId: org.id,
        lastLoginAt: new Date(),
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
  }

  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  await setSessionCookie(token);

  return user;
}
