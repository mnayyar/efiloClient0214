# Phase 2: Authentication (WorkOS)

## Goal
Implement WorkOS authentication with SSO support, session management, auth middleware, and the login/callback/logout flows. After this phase, every route behind `(dashboard)` requires authentication.

## Prompt for Claude Code

```
Implement WorkOS authentication for efilo.ai. Read CLAUDE.md for architecture context. This is a single-tenant app — one Organization per database, no multi-tenant scoping.

### Step 1: WorkOS Client (`lib/workos.ts`)

```typescript
import { WorkOS } from "@workos-inc/node";

export const workos = new WorkOS(process.env.WORKOS_API_KEY!);

// Get authenticated user from request
export async function getSession(cookieHeader: string | null) {
  // Parse JWT from cookie, verify with WorkOS
  // Return user object or null
}

// Get or create User record in our DB from WorkOS user
export async function getOrCreateUser(workosUser: { id: string; email: string; firstName?: string; lastName?: string }) {
  // Upsert User in Prisma by workosUserId
}
```

### Step 2: Auth Middleware (`src/middleware.ts`)

Create Next.js middleware that:
1. Checks for auth cookie on all routes under `/(dashboard)` and `/api/*` (except `/api/auth/*` and `/api/inngest`)
2. If no valid session, redirect to login page
3. If valid session, attach user to request context
4. Skip auth for public routes: `/`, `/login`, `/api/auth/*`, `/api/inngest`

```typescript
import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Public routes — skip auth
  const publicPaths = ["/", "/login", "/api/auth", "/api/inngest"];
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  
  // Check auth cookie
  const sessionToken = request.cookies.get("efilo_session")?.value;
  if (!sessionToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  
  // Verify JWT and continue
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

### Step 3: Auth API Routes

**POST /api/auth/callback/workos** — WorkOS callback handler:
1. Exchange authorization code for user profile
2. Upsert User record in database
3. Create JWT session token
4. Set httpOnly cookie `efilo_session`
5. Redirect to dashboard

**GET /api/auth/sso** — Initiate SSO login:
1. Get WorkOS organization ID from env
2. Generate WorkOS authorization URL
3. Redirect to WorkOS hosted login

**POST /api/auth/logout** — Logout:
1. Clear session cookie
2. Return success

**GET /api/auth/user** — Get current user:
1. Verify session from cookie
2. Return User record from database

### Step 4: Login Page (`src/app/(auth)/login/page.tsx`)

Create a minimal but branded login page:
- efilo.ai logo/wordmark centered
- "Your Projects. Finally Connected." tagline
- "Sign in with SSO" button (Construction Orange primary button)
- Clicking button redirects to /api/auth/sso
- Warm off-white background (#FAFAF8)
- If there's an error query param, show error toast

### Step 5: Dashboard Layout (`src/app/(dashboard)/layout.tsx`)

Create the authenticated layout shell:
1. Server component that checks auth
2. If not authenticated, redirect to /login
3. If authenticated, render sidebar + main content area
4. Pass user context to client components via React context or Zustand

### Step 6: Auth Context

Create a Zustand store or React context for the authenticated user:

```typescript
// stores/auth-store.ts
interface AuthStore {
  user: User | null;
  setUser: (user: User) => void;
  logout: () => void;
}
```

### Step 7: API Route Auth Helper

Create a reusable helper for API routes:

```typescript
// lib/auth.ts
import { NextRequest } from "next/server";

export async function requireAuth(request: NextRequest) {
  const sessionToken = request.cookies.get("efilo_session")?.value;
  if (!sessionToken) {
    throw new AuthError("Unauthorized");
  }
  // Verify JWT, get user from DB
  return user;
}
```

### Step 8: Rate Limiting (`lib/rate-limit.ts`)

Implement in-memory rate limiting per Root v2.2:

```typescript
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(userId: string, limit = 100, windowMs = 3600000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}
```

### Step 9: Verify

- Login flow works end-to-end (you'll need WorkOS dev environment credentials)
- Unauthenticated requests to /api/* return 401
- Dashboard routes redirect to login when not authenticated
- User record created in database after first login

For local development without WorkOS, create a dev-only bypass:
- If ENVIRONMENT=development AND WORKOS_API_KEY is not set
- Auto-login as a seed user (create via prisma seed)
- This lets you develop the UI without needing WorkOS credentials immediately

DO NOT build any features beyond auth in this phase.
```

## Success Criteria
- [ ] Login page renders with efilo branding
- [ ] SSO flow redirects to WorkOS and back
- [ ] Session cookie set after successful login
- [ ] Dashboard routes protected by auth middleware
- [ ] API routes return 401 when unauthenticated
- [ ] Dev bypass works for local development
- [ ] User record upserted in database
