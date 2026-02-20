import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useAuthStore } from "@/stores/auth-store";

export function CallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setError("Missing authentication code.");
      return;
    }

    fetch(`/api/auth/callback/workos?code=${encodeURIComponent(code)}`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || "Authentication failed.");
        }
        return res.json();
      })
      .then((data) => {
        setUser(data.data.user);
        navigate("/projects", { replace: true });
      })
      .catch((err) => {
        setError(err.message);
      });
  }, [searchParams, navigate, setUser]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-off-white">
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-status-critical">{error}</p>
          <a href="/login" className="text-sm text-brand-orange underline">
            Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-off-white">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-orange border-t-transparent" />
        <p className="text-sm text-text-secondary">Processing authentication...</p>
      </div>
    </div>
  );
}
