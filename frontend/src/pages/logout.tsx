import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuthStore } from "@/stores/auth-store";
import { logout as apiLogout } from "@/api/auth";

export function LogoutPage() {
  const navigate = useNavigate();
  const storeLogout = useAuthStore((s) => s.logout);

  useEffect(() => {
    apiLogout()
      .catch(() => {})
      .finally(() => {
        storeLogout();
        navigate("/login", { replace: true });
      });
  }, [navigate, storeLogout]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-off-white">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-orange border-t-transparent" />
        <p className="text-sm text-text-secondary">Logging out...</p>
      </div>
    </div>
  );
}
