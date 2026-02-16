"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronRight, Menu, LogOut } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface HeaderProps {
  onMobileMenuToggle?: () => void;
}

const AGENT_LABELS: Record<string, string> = {
  search: "Ask about your Project",
  rfis: "Notices & RFI",
  compliance: "Compliance Engine",
  health: "Project Health",
  changes: "Change Intelligence",
  meetings: "Meeting & Workflow",
  "enterprise-agent": "Enterprise Intelligence",
  closeout: "Closeout & Retention",
};

function useBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // Inside a project route: /projects/{id}/{agent} — just show the agent label
  const projectsIdx = segments.indexOf("projects");
  if (projectsIdx !== -1 && segments.length > projectsIdx + 2) {
    const agentSlug = segments[projectsIdx + 2];
    const label = AGENT_LABELS[agentSlug] || agentSlug.charAt(0).toUpperCase() + agentSlug.slice(1);
    return [{ label, href: pathname }];
  }

  // Other pages: simple capitalized segments, skip IDs
  const crumbs: { label: string; href: string }[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const href = "/" + segments.slice(0, i + 1).join("/");

    // Skip project IDs
    if (i > 0 && segments[i - 1] === "projects" && segment !== "projects") {
      continue;
    }

    const label = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
    crumbs.push({ label, href });
  }

  return crumbs;
}

export function Header({ onMobileMenuToggle }: HeaderProps) {
  const crumbs = useBreadcrumbs();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    logout();
    router.push("/login");
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border-card bg-background px-6">
      <div className="flex items-center gap-2">
        {/* Mobile menu button */}
        {onMobileMenuToggle && (
          <button
            onClick={onMobileMenuToggle}
            className="rounded-md p-1.5 text-text-secondary hover:text-text-primary lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1 text-sm">
          {crumbs.map((crumb, i) => (
            <span key={crumb.href} className="flex items-center gap-1">
              {i > 0 && (
                <ChevronRight className="h-3 w-3 text-text-secondary" />
              )}
              {i === crumbs.length - 1 ? (
                <span className="font-medium text-text-primary">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="text-text-secondary transition-colors hover:text-text-primary"
                >
                  {crumb.label}
                </Link>
              )}
            </span>
          ))}
        </nav>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <button
          className={cn(
            "relative rounded-md p-2 text-text-secondary transition-colors hover:text-text-primary"
          )}
        >
          <Bell className="h-4 w-4" />
        </button>

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-border-card">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-orange/10 text-sm font-medium text-brand-orange">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="hidden min-w-0 text-left sm:block">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {user.name}
                  </p>
                  <p className="truncate text-xs text-text-secondary">
                    {user.email}
                  </p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" className="w-48">
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
