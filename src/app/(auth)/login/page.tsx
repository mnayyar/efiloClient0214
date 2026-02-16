"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const error = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);

  const errorMessages: Record<string, string> = {
    missing_code: "Authentication failed. Please try again.",
    auth_failed: "Could not verify your identity. Please try again.",
    not_authorized:
      "Your account is not authorized to access this application. Contact your administrator.",
  };

  const displayError =
    loginError || (error && (errorMessages[error] || "An unexpected error occurred."));

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Login failed.");
        return;
      }

      router.push("/projects");
    } catch {
      setLoginError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-off-white">
      <div className="flex w-full max-w-sm flex-col items-center gap-8 px-6">
        {/* Logo / Wordmark */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-orange">
            <span className="text-xl font-bold text-white">e</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
            efilo.ai
          </h1>
          <p className="text-center text-text-secondary">
            Your Projects. Finally Connected.
          </p>
        </div>

        {/* Error message */}
        {displayError && (
          <div className="w-full rounded-md border border-status-critical/20 bg-status-critical/5 px-4 py-3 text-sm text-status-critical">
            {displayError}
          </div>
        )}

        {/* SSO Button */}
        <a
          href="/api/auth/sso"
          className="flex h-11 w-full items-center justify-center rounded-lg bg-brand-orange font-medium text-white transition-colors hover:bg-brand-orange/90"
        >
          Sign in with SSO
        </a>

        {/* Divider */}
        <div className="flex w-full items-center gap-3">
          <div className="h-px flex-1 bg-card-border" />
          <span className="text-xs text-text-secondary">or</span>
          <div className="h-px flex-1 bg-card-border" />
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleEmailLogin} className="flex w-full flex-col gap-4">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setLoginError("");
            }}
            required
            className="h-11 w-full rounded-lg border border-card-border bg-card px-4 text-sm text-text-primary placeholder:text-text-secondary/50 focus:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setLoginError("");
            }}
            required
            className="h-11 w-full rounded-lg border border-card-border bg-card px-4 text-sm text-text-primary placeholder:text-text-secondary/50 focus:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange"
          />
          <button
            type="submit"
            disabled={loading}
            className="flex h-11 w-full items-center justify-center rounded-lg border border-card-border bg-card font-medium text-text-primary transition-colors hover:bg-muted disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in with Email"}
          </button>
        </form>

        <p className="text-center text-xs text-text-secondary">
          Contact your administrator if you don&apos;t have access.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
