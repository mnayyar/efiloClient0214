import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuthStore } from "@/stores/auth-store";
import { getMe } from "@/api/auth";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [checking, setChecking] = useState(!user);
  const location = useLocation();

  useEffect(() => {
    if (user) return;
    getMe()
      .then((u) => {
        if (u) setUser(u);
      })
      .finally(() => setChecking(false));
  }, [user, setUser]);

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-orange border-t-transparent" />
          <p className="text-sm text-text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
