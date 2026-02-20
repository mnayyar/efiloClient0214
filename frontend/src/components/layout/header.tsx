import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  ArrowLeftRight,
  Bell,
  ChevronRight,
  FolderOpen,
  LogOut,
  Menu,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { logout as apiLogout } from "@/api/auth";
import { getProject, type Project } from "@/api/projects";

interface HeaderProps {
  onMobileMenuToggle?: () => void;
  activeProjectId?: string;
  onSwitchProject?: () => void;
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

export function Header({
  onMobileMenuToggle,
  activeProjectId,
  onSwitchProject,
}: HeaderProps) {
  const { pathname } = useLocation();
  const user = useAuthStore((s) => s.user);
  const storeLogout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    if (!activeProjectId) {
      setProject(null);
      return;
    }
    let cancelled = false;
    getProject(activeProjectId)
      .then((p) => {
        if (!cancelled) setProject(p);
      })
      .catch(() => {
        if (!cancelled) setProject(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  // Build breadcrumbs
  const segments = pathname.split("/").filter(Boolean);
  const projectsIdx = segments.indexOf("projects");
  const agentSlug =
    projectsIdx !== -1 && segments.length > projectsIdx + 2
      ? segments[projectsIdx + 2]
      : null;
  const agentLabel = agentSlug
    ? AGENT_LABELS[agentSlug] ||
      agentSlug.charAt(0).toUpperCase() + agentSlug.slice(1)
    : null;

  async function handleLogout() {
    await apiLogout();
    storeLogout();
    navigate("/login");
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border-card bg-background px-6">
      <div className="flex items-center gap-2">
        {onMobileMenuToggle && (
          <button
            onClick={onMobileMenuToggle}
            className="rounded-md p-1.5 text-text-secondary hover:text-text-primary lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        <nav className="flex items-center gap-1.5 text-sm">
          {/* Project name (if inside a project) */}
          {project && (
            <>
              <span className="flex items-center gap-1.5 px-2 py-1 text-text-secondary">
                <FolderOpen className="h-3.5 w-3.5" />
                <span className="max-w-[200px] truncate font-medium">
                  {project.name}
                </span>
              </span>
              {agentLabel && (
                <ChevronRight className="h-3 w-3 text-text-secondary" />
              )}
            </>
          )}

          {/* Agent label */}
          {agentLabel && (
            <span className="font-medium text-text-primary">{agentLabel}</span>
          )}

          {/* Non-project pages */}
          {!project &&
            !agentLabel &&
            segments.map((seg, i) => {
              const href = "/" + segments.slice(0, i + 1).join("/");
              const label =
                seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " ");
              return (
                <span key={href} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <ChevronRight className="h-3 w-3 text-text-secondary" />
                  )}
                  {i === segments.length - 1 ? (
                    <span className="font-medium text-text-primary">
                      {label}
                    </span>
                  ) : (
                    <Link
                      to={href}
                      className="text-text-secondary transition-colors hover:text-text-primary"
                    >
                      {label}
                    </Link>
                  )}
                </span>
              );
            })}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        {project && onSwitchProject && (
          <button
            onClick={onSwitchProject}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-border-card hover:text-text-primary"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Switch Project</span>
          </button>
        )}

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
