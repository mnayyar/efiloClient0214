import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { getUserById } from "@/lib/workos";
import type { User } from "@prisma/client";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Require authentication for an API route.
 * Returns the authenticated User or throws/returns 401.
 */
export async function requireAuth(
  request: NextRequest
): Promise<User> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    throw new AuthError("Unauthorized");
  }

  const session = await verifySessionToken(token);
  if (!session) {
    throw new AuthError("Invalid or expired session");
  }

  const user = await getUserById(session.userId);
  if (!user) {
    throw new AuthError("User not found");
  }

  return user;
}

/**
 * Wrap an API handler with auth + error handling.
 */
export function withAuth(
  handler: (request: NextRequest, user: User) => Promise<NextResponse>
) {
  return async (request: NextRequest) => {
    try {
      const user = await requireAuth(request);
      return await handler(request, user);
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
      console.error("API error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  };
}
