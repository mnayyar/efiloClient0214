import { useState } from "react";
import { useNavigate, useLocation } from "react-router";
import { getMe } from "@/api/auth";
import { useAuthStore } from "@/stores/auth-store";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/projects";

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.detail || data.error || "Login failed.");
        return;
      }

      // Cookie is set — fetch user profile
      const user = await getMe();
      if (user) {
        setUser(user);
        navigate(from, { replace: true });
      } else {
        setError("Login succeeded but could not fetch user profile.");
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  function handleDevLogin() {
    // Dev bypass: SSO endpoint auto-redirects with cookie set
    window.location.href = "/api/auth/sso";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-off-white">
      <div className="flex w-full max-w-sm flex-col items-center gap-8 px-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <img src="/logo.svg" alt="efilo" className="h-12 w-12" />
          <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
            efilo.ai
          </h1>
          <p className="text-center text-text-secondary">
            Your Projects. Finally Connected.
          </p>
        </div>

        {error && (
          <div className="w-full rounded-md border border-status-critical/20 bg-status-critical/5 px-4 py-3 text-sm text-status-critical">
            {error}
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
              setError("");
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
              setError("");
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

        {/* Dev login shortcut */}
        <button
          onClick={handleDevLogin}
          disabled={loading}
          className="text-xs text-text-secondary underline transition-colors hover:text-text-primary disabled:opacity-50"
        >
          Dev Login (mnayyar@efilo.ai)
        </button>

        <p className="text-center text-xs text-text-secondary">
          Contact your administrator if you don&apos;t have access.
        </p>
      </div>
    </div>
  );
}
