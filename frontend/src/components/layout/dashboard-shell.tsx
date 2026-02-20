import { useState, useCallback, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { FolderOpen, Search } from "lucide-react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getProjects, type Project } from "@/api/projects";

export function DashboardShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Close mobile sidebar on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Extract active project ID and current agent from pathname
  const projectMatch = pathname.match(/\/projects\/([^/]+)/);
  const activeProjectId = projectMatch?.[1];

  const segments = pathname.split("/").filter(Boolean);
  const projectsIdx = segments.indexOf("projects");
  const currentAgent =
    projectsIdx !== -1 && segments.length > projectsIdx + 2
      ? segments[projectsIdx + 2]
      : "search";

  const handleSwitchProject = useCallback(async () => {
    try {
      const data = await getProjects();
      setProjects(data);
    } catch {
      // silently fail
    }
    setProjectSearch("");
    setPickerOpen(true);
  }, []);

  function handleProjectPicked(projectId: string) {
    setPickerOpen(false);
    setProjectSearch("");
    navigate(`/projects/${projectId}/${currentAgent}`);
  }

  const filtered = projects.filter((p) => {
    if (!projectSearch.trim()) return true;
    const q = projectSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.projectCode.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
          activeProjectId={activeProjectId}
          onSwitchProject={handleSwitchProject}
        />
      </div>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[280px] p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar
            collapsed={false}
            onToggle={() => setMobileOpen(false)}
            activeProjectId={activeProjectId}
            onSwitchProject={handleSwitchProject}
          />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        <Header
          onMobileMenuToggle={() => setMobileOpen(true)}
          activeProjectId={activeProjectId}
          onSwitchProject={handleSwitchProject}
        />
        <main className="flex-1 overflow-y-auto bg-brand-off-white dark:bg-background">
          <Outlet />
        </main>
      </div>

      {/* Project Picker Dialog */}
      <Dialog
        open={pickerOpen}
        onOpenChange={(v) => {
          if (!v) {
            setPickerOpen(false);
            setProjectSearch("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Switch Project</DialogTitle>
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
            {filtered.map((project) => (
              <button
                key={project.id}
                onClick={() => handleProjectPicked(project.id)}
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:border-brand-orange hover:bg-brand-orange/5 ${
                  project.id === activeProjectId
                    ? "border-brand-orange bg-brand-orange/5"
                    : "border-border-card"
                }`}
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
                {project.id === activeProjectId && (
                  <span className="text-[10px] font-medium text-brand-orange">
                    Current
                  </span>
                )}
              </button>
            ))}
            {projects.length > 0 && filtered.length === 0 && (
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
    </div>
  );
}
