import { NextRequest, NextResponse } from "next/server";
import { workos, WORKOS_CLIENT_ID, getOrCreateUser, UserNotFoundError } from "@/lib/workos";
import { createSessionToken, setSessionCookie } from "@/lib/session";

export async function GET(request: NextRequest) {
  // Handle errors returned by the IdP (e.g. user not allowed)
  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    const description = request.nextUrl.searchParams.get("error_description");
    const errorType = description?.toLowerCase().includes("not configured")
      ? "not_authorized"
      : "auth_failed";
    return NextResponse.redirect(
      new URL(`/login?error=${errorType}`, request.url)
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=missing_code", request.url)
    );
  }

  try {
    const { user: workosUser } =
      await workos.userManagement.authenticateWithCode({
        code,
        clientId: WORKOS_CLIENT_ID,
      });

    // Upsert user in our database
    const user = await getOrCreateUser({
      id: workosUser.id,
      email: workosUser.email,
      firstName: workosUser.firstName ?? undefined,
      lastName: workosUser.lastName ?? undefined,
    });

    // Create session token and set cookie
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    await setSessionCookie(token);

    return NextResponse.redirect(
      new URL("/projects", request.url)
    );
  } catch (error) {
    console.error("WorkOS callback error:", error);
    if (error instanceof UserNotFoundError) {
      return NextResponse.redirect(
        new URL("/login?error=not_authorized", request.url)
      );
    }
    return NextResponse.redirect(
      new URL("/login?error=auth_failed", request.url)
    );
  }
}
