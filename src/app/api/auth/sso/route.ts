import { NextRequest, NextResponse } from "next/server";
import { workos, WORKOS_CLIENT_ID, WORKOS_REDIRECT_URI } from "@/lib/workos";
import { isDevBypass, devLogin } from "@/lib/dev-auth";

export async function GET(request: NextRequest) {
  // Dev bypass — auto-login without WorkOS
  if (isDevBypass()) {
    await devLogin();
    return NextResponse.redirect(new URL("/projects", request.url));
  }

  const authorizationUrl = workos.userManagement.getAuthorizationUrl({
    organizationId: process.env.WORKOS_ORGANIZATION_ID!,
    clientId: WORKOS_CLIENT_ID,
    redirectUri: WORKOS_REDIRECT_URI,
  });

  return NextResponse.redirect(authorizationUrl);
}
