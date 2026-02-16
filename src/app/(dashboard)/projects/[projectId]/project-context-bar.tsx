"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FolderOpen, ArrowLeftRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface Project {
  id: string;
  name: string;
  projectCode: string;
}

interface ProjectContextBarProps {
  projectId: string;
  name: string;
  code: string;
  type: string;
}

export function ProjectContextBar({ projectId, name, code, type }: ProjectContextBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [switchOpen, setSwitchOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectSearch, setProjectSearch] = useState("");

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) return;
      const { data } = await res.json();
      setProjects(data);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    if (switchOpen) {
      fetchProjects();
    }
  }, [switchOpen, fetchProjects]);

  function handleSwitch(newProjectId: string) {
    // Replace current projectId in the URL with the new one
    const newPath = pathname.replace(`/projects/${projectId}`, `/projects/${newProjectId}`);
    router.push(newPath);
    setSwitchOpen(false);
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-border-card bg-brand-off-white px-6 py-2">
        <FolderOpen className="h-4 w-4 text-brand-orange" />
        <span className="text-sm font-semibold text-text-primary">{name}</span>
        <Badge variant="outline" className="text-[10px]">
          {code}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          {type}
        </Badge>

        <button
          onClick={() => setSwitchOpen(true)}
          className="ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-border-card hover:text-text-primary"
        >
          <ArrowLeftRight className="h-3 w-3" />
          Switch Project
        </button>
      </div>

      <Dialog
        open={switchOpen}
        onOpenChange={(v) => {
          setSwitchOpen(v);
          if (!v) setProjectSearch("");
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Switch Project</DialogTitle>
            <DialogDescription>
              Select a different project. Your current agent view will stay the same.
            </DialogDescription>
          </DialogHeader>

          {/* Search input */}
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
                if (p.id === projectId) return false;
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
                  onClick={() => handleSwitch(project.id)}
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
            {projects.filter((p) => p.id !== projectId).length > 0 &&
              projects.filter((p) => {
                if (p.id === projectId) return false;
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
            {projects.filter((p) => p.id !== projectId).length === 0 && (
              <p className="py-4 text-center text-sm text-text-secondary">
                No other projects available.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
