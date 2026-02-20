import { useEffect, useState, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  FolderOpen,
  MessageSquareText,
  FileWarning,
  ShieldCheck,
  Activity,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Wrench,
  ArrowLeftRight,
  CalendarCheck,
  Building2,
  CheckCircle2,
  Search,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getProject, getProjects, type Project } from "@/api/projects";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeProjectId?: string;
  onSwitchProject?: () => void;
}

const AGENTS = [
  {
    label: "Ask about your Project",
    shortLabel: "Ask",
    icon: MessageSquareText,
    path: "search",
    iconGradient: "from-blue-400 to-blue-600",
    activeBg: "bg-blue-500/15",
    activeBar: "bg-blue-400",
    hoverBg: "hover:bg-white/[0.06]",
  },
  {
    label: "Notices & RFI",
    shortLabel: "RFI",
    icon: FileWarning,
    path: "rfis",
    iconGradient: "from-amber-400 to-orange-500",
    activeBg: "bg-amber-500/15",
    activeBar: "bg-amber-400",
    hoverBg: "hover:bg-white/[0.06]",
  },
  {
    label: "Compliance Engine",
    shortLabel: "Comply",
    icon: ShieldCheck,
    path: "compliance",
    iconGradient: "from-emerald-400 to-green-500",
    activeBg: "bg-emerald-500/15",
    activeBar: "bg-emerald-400",
    hoverBg: "hover:bg-white/[0.06]",
  },
  {
    label: "Project Health",
    shortLabel: "Health",
    icon: Activity,
    path: "health",
    iconGradient: "from-violet-400 to-purple-500",
    activeBg: "bg-violet-500/15",
    activeBar: "bg-violet-400",
    hoverBg: "hover:bg-white/[0.06]",
  },
  {
    label: "Change Intelligence",
    shortLabel: "Changes",
    icon: ArrowLeftRight,
    path: "changes",
    iconGradient: "from-rose-400 to-pink-500",
    activeBg: "bg-rose-500/15",
    activeBar: "bg-rose-400",
    hoverBg: "hover:bg-white/[0.06]",
    roadmap: true,
  },
  {
    label: "Meeting & Workflow",
    shortLabel: "Meetings",
    icon: CalendarCheck,
    path: "meetings",
    iconGradient: "from-teal-400 to-cyan-500",
    activeBg: "bg-teal-500/15",
    activeBar: "bg-teal-400",
    hoverBg: "hover:bg-white/[0.06]",
    roadmap: true,
  },
  {
    label: "Enterprise Intelligence",
    shortLabel: "Enterprise",
    icon: Building2,
    path: "enterprise-agent",
    iconGradient: "from-indigo-400 to-blue-500",
    activeBg: "bg-indigo-500/15",
    activeBar: "bg-indigo-400",
    hoverBg: "hover:bg-white/[0.06]",
    roadmap: true,
  },
  {
    label: "Closeout & Retention",
    shortLabel: "Closeout",
    icon: CheckCircle2,
    path: "closeout",
    iconGradient: "from-pink-400 to-fuchsia-500",
    activeBg: "bg-pink-500/15",
    activeBar: "bg-pink-400",
    hoverBg: "hover:bg-white/[0.06]",
    roadmap: true,
  },
] as const;

const BOTTOM_NAV = [
  { href: "/project-setup", label: "Project Setup", icon: Wrench },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ collapsed, onToggle, activeProjectId, onSwitchProject }: SidebarProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [activeProject, setActiveProject] = useState<Project | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await getProjects();
      setProjects(data);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects, pathname]);

  useEffect(() => {
    if (!activeProjectId) {
      setActiveProject(null);
      return;
    }
    let cancelled = false;
    getProject(activeProjectId)
      .then((p) => { if (!cancelled) setActiveProject(p); })
      .catch(() => { if (!cancelled) setActiveProject(null); });
    return () => { cancelled = true; };
  }, [activeProjectId]);

  function handleAgentClick(agentPath: string) {
    if (activeProjectId) {
      navigate(`/projects/${activeProjectId}/${agentPath}`);
    } else {
      fetchProjects();
      setPickingFor(agentPath);
    }
  }

  function handleProjectPicked(projectId: string) {
    if (pickingFor) {
      navigate(`/projects/${projectId}/${pickingFor}`);
      setPickingFor(null);
    }
  }

  const activeAgents = AGENTS.filter((a) => !a.roadmap);
  const roadmapAgents = AGENTS.filter((a) => a.roadmap);

  return (
    <>
      <aside
        className={cn(
          "flex h-screen flex-col bg-slate-800 transition-all duration-200",
          collapsed ? "w-20" : "w-[272px]"
        )}
      >
        {/* Logo header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
          <Link to="/projects" className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white">
              <img src="/logo.svg" alt="efilo" className="h-6 w-6" />
            </div>
            {!collapsed && (
              <span className="text-lg font-semibold text-white">efilo</span>
            )}
          </Link>
          <button
            onClick={onToggle}
            className="rounded-md p-1 text-slate-400 transition-colors hover:text-white"
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Active project indicator */}
        {activeProject && (
          <div className={cn(
            "shrink-0 border-b border-white/10 px-3 py-3",
            collapsed && "px-2"
          )}>
            {collapsed ? (
              <button
                onClick={onSwitchProject}
                className="flex w-full items-center justify-center rounded-lg p-2 text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white"
                title={`${activeProject.name} — Switch project`}
              >
                <FolderOpen className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={onSwitchProject}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.06]"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-orange/20">
                  <FolderOpen className="h-4 w-4 text-brand-orange" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-white">
                    {activeProject.name}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Switch project
                  </p>
                </div>
              </button>
            )}
          </div>
        )}

        {/* Scrollable agents area */}
        <div className="flex-1 overflow-y-auto px-3 pt-4 pb-2">
          {!collapsed && (
            <p className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              AI Agents
            </p>
          )}

          {/* Active agents */}
          <div className="flex flex-col gap-1">
            {activeAgents.map((agent) => {
              const agentHref = activeProjectId
                ? `/projects/${activeProjectId}/${agent.path}`
                : null;
              const isActive = agentHref
                ? pathname === agentHref || pathname.startsWith(agentHref + "/")
                : false;

              return (
                <button
                  key={agent.path}
                  onClick={() => handleAgentClick(agent.path)}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-all duration-150",
                    isActive
                      ? cn(agent.activeBg, "text-white")
                      : cn("text-slate-300", agent.hoverBg),
                    collapsed && "justify-center px-0"
                  )}
                  title={collapsed ? agent.shortLabel : undefined}
                >
                  {isActive && (
                    <div
                      className={cn(
                        "absolute left-0 top-2 bottom-2 w-[3px] rounded-full",
                        agent.activeBar
                      )}
                    />
                  )}
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br shadow-sm transition-transform duration-150 group-hover:scale-105",
                      agent.iconGradient
                    )}
                  >
                    <agent.icon className="h-4 w-4 text-white" />
                  </div>
                  {!collapsed && <span className="truncate">{agent.label}</span>}
                </button>
              );
            })}
          </div>

          {/* Roadmap divider */}
          <div className="my-4 flex items-center gap-2 px-2">
            {!collapsed ? (
              <>
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  Roadmap
                </span>
                <div className="h-px flex-1 bg-white/10" />
              </>
            ) : (
              <div className="h-px w-full bg-white/10" />
            )}
          </div>

          {/* Roadmap agents */}
          <div className="flex flex-col gap-1">
            {roadmapAgents.map((agent) => (
              <div
                key={agent.path}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-all duration-150",
                  "cursor-default text-slate-400",
                  collapsed && "justify-center px-0"
                )}
                title={collapsed ? `${agent.shortLabel} — Roadmap` : undefined}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br opacity-50 transition-opacity group-hover:opacity-70",
                    agent.iconGradient
                  )}
                >
                  <agent.icon className="h-4 w-4 text-white" />
                </div>
                {!collapsed && (
                  <span className="truncate text-slate-300 transition-colors group-hover:text-slate-200">
                    {agent.label}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom nav */}
        <div className="border-t border-white/10 px-3 py-2">
          <nav className="flex flex-col gap-1">
            {BOTTOM_NAV.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-150",
                    isActive
                      ? "bg-brand-orange/15 text-brand-orange"
                      : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200",
                    collapsed && "justify-center px-0"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  {isActive && (
                    <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-brand-orange" />
                  )}
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Project Picker Dialog */}
      <Dialog
        open={!!pickingFor}
        onOpenChange={(v) => {
          if (!v) {
            setPickingFor(null);
            setProjectSearch("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Select a Project</DialogTitle>
            <DialogDescription>
              Choose which project you&apos;d like to work with.
            </DialogDescription>
          </DialogHeader>

          {projects.length > 1 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <input
                type="text"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder="Search by name or code..."
                autoFocus
                className="w-full rounded-lg border border-border-card bg-brand-off-white py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-secondary focus:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange dark:bg-muted"
              />
            </div>
          )}

          <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto py-1">
            {projects
              .filter((p) => {
                if (!projectSearch.trim()) return true;
                const q = projectSearch.toLowerCase();
                return (
                  p.name.toLowerCase().includes(q) ||
                  p.projectCode.toLowerCase().includes(q)
                );
              })
              .map((project) => (
                <button
                  key={project.id}
                  onClick={() => handleProjectPicked(project.id)}
                  className="flex items-center gap-3 rounded-lg border border-border-card px-4 py-3 text-left transition-colors hover:border-brand-orange hover:bg-brand-orange/5"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-orange/10">
                    <FolderOpen className="h-4 w-4 text-brand-orange" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {project.name}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {project.projectCode}
                    </p>
                  </div>
                </button>
              ))}
            {projects.length > 0 &&
              projects.filter((p) => {
                if (!projectSearch.trim()) return true;
                const q = projectSearch.toLowerCase();
                return (
                  p.name.toLowerCase().includes(q) ||
                  p.projectCode.toLowerCase().includes(q)
                );
              }).length === 0 && (
                <p className="py-4 text-center text-sm text-text-secondary">
                  No projects match &quot;{projectSearch}&quot;
                </p>
              )}
            {projects.length === 0 && (
              <p className="py-4 text-center text-sm text-text-secondary">
                No projects yet. Go to Project Setup to create one.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
