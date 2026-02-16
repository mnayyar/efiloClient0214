"use client";

import { useEffect, useState, useCallback } from "react";
import {
  FolderOpen,
  Plus,
  Pencil,
  ChevronRight,
  ArrowLeft,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DocumentList } from "@/components/documents/document-list";

interface Project {
  id: string;
  projectCode: string;
  name: string;
  type: string;
  contractType: string | null;
  contractValue: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count: { documents: number; rfis: number };
}

const PROJECT_TYPES = [
  { value: "COMMERCIAL", label: "Commercial" },
  { value: "INDUSTRIAL", label: "Industrial" },
  { value: "INSTITUTIONAL", label: "Institutional" },
  { value: "RESIDENTIAL", label: "Residential" },
  { value: "INFRASTRUCTURE", label: "Infrastructure" },
] as const;

const CONTRACT_TYPES = [
  { value: "LUMP_SUM", label: "Lump Sum" },
  { value: "GMP", label: "GMP" },
  { value: "COST_PLUS", label: "Cost Plus" },
  { value: "UNIT_PRICE", label: "Unit Price" },
  { value: "TIME_AND_MATERIAL", label: "Time & Material" },
] as const;

export default function ProjectSetupPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectSearch, setProjectSearch] = useState("");

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      const { data } = await res.json();
      setProjects(data);
      // Update selected project if it's still in the list
      if (selectedProject) {
        const updated = data.find((p: Project) => p.id === selectedProject.id);
        if (updated) setSelectedProject(updated);
      }
    } catch {
      toast.error("Failed to load projects.");
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // If a project is selected, show the detail view with documents
  if (selectedProject) {
    return (
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b border-border-card px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedProject(null)}
              className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-border-card hover:text-text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-orange/10">
              <FolderOpen className="h-5 w-5 text-brand-orange" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-text-primary">
                  {selectedProject.name}
                </h1>
                <Badge variant="outline" className="text-xs">
                  {selectedProject.projectCode}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {selectedProject.type}
                </Badge>
              </div>
              <p className="text-xs text-text-secondary">
                {selectedProject.contractType &&
                  `${CONTRACT_TYPES.find((c) => c.value === selectedProject.contractType)?.label ?? selectedProject.contractType}`}
                {selectedProject.contractType && selectedProject.contractValue && " · "}
                {selectedProject.contractValue &&
                  `$${Number(selectedProject.contractValue).toLocaleString()}`}
                {!selectedProject.contractType && !selectedProject.contractValue && "No contract details set"}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditProject(selectedProject)}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit Project
            </Button>
          </div>
        </div>

        {/* Documents section */}
        <div className="flex-1 overflow-y-auto p-6">
          <DocumentList projectId={selectedProject.id} />
        </div>

        {editProject && (
          <EditProjectDialog
            project={editProject}
            open={!!editProject}
            onClose={() => setEditProject(null)}
            onSuccess={fetchProjects}
          />
        )}
      </div>
    );
  }

  // Project list view
  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            Project Setup
          </h1>
          <p className="text-sm text-text-secondary">
            Create, configure, and manage your projects and their documents.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Project
        </Button>
      </div>

      {/* Search bar */}
      {!loading && projects.length > 1 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <input
            type="text"
            value={projectSearch}
            onChange={(e) => setProjectSearch(e.target.value)}
            placeholder="Search projects by name or code..."
            className="w-full rounded-lg border border-border-card bg-card py-2.5 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-secondary focus:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange"
          />
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-text-secondary">
          Loading projects...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              onClick={() => setSelectedProject(project)}
              className="group rounded-lg border border-border-card bg-card p-5 text-left transition-colors hover:border-brand-orange"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-orange/10">
                  <FolderOpen className="h-5 w-5 text-brand-orange" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between">
                    <h3 className="truncate font-medium text-text-primary">
                      {project.name}
                    </h3>
                    <ChevronRight className="h-4 w-4 shrink-0 text-text-secondary opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {project.projectCode}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {project.type}
                    </Badge>
                  </div>
                  <div className="mt-3 flex gap-4 text-xs text-text-secondary">
                    <span>{project._count.documents} docs</span>
                    <span>{project._count.rfis} RFIs</span>
                  </div>
                </div>
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
              <div className="col-span-full py-12 text-center text-sm text-text-secondary">
                No projects match &quot;{projectSearch}&quot;
              </div>
            )}
          {projects.length === 0 && (
            <div className="col-span-full py-12 text-center text-sm text-text-secondary">
              No projects yet. Click &quot;Add Project&quot; to create your
              first one.
            </div>
          )}
        </div>
      )}

      <AddProjectDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={fetchProjects}
      />

      {editProject && (
        <EditProjectDialog
          project={editProject}
          open={!!editProject}
          onClose={() => setEditProject(null)}
          onSuccess={fetchProjects}
        />
      )}
    </div>
  );
}

// ─── Add Project Dialog ──────────────────────────────────────────────────────

function AddProjectDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [type, setType] = useState<string>("COMMERCIAL");
  const [contractType, setContractType] = useState<string>("");
  const [contractValue, setContractValue] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setProjectCode("");
    setType("COMMERCIAL");
    setContractType("");
    setContractValue("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const body: Record<string, unknown> = {
        name,
        projectCode: projectCode.trim(),
        type,
      };

      if (contractType) {
        body.contractType = contractType;
      }

      if (contractValue) {
        const parsed = parseFloat(contractValue.replace(/,/g, ""));
        if (!isNaN(parsed) && parsed > 0) {
          body.contractValue = parsed;
        }
      }

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create project.");
        return;
      }

      toast.success(`${name} has been created.`);
      reset();
      onClose();
      onSuccess();
    } catch {
      toast.error("Failed to create project.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Project</DialogTitle>
          <DialogDescription>
            Create a new project. You can upload documents once the project is
            set up.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="add-name">Project Name</Label>
            <Input
              id="add-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Downtown Office MEP"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="add-code">Project Code</Label>
            <Input
              id="add-code"
              value={projectCode}
              onChange={(e) => setProjectCode(e.target.value.toUpperCase())}
              placeholder="PRJ-001"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Project Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Contract Type (optional)</Label>
            <Select value={contractType} onValueChange={setContractType}>
              <SelectTrigger>
                <SelectValue placeholder="Select contract type" />
              </SelectTrigger>
              <SelectContent>
                {CONTRACT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="add-value">Contract Value (optional)</Label>
            <Input
              id="add-value"
              value={contractValue}
              onChange={(e) => setContractValue(e.target.value)}
              placeholder="1,500,000"
              inputMode="decimal"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Project Dialog ─────────────────────────────────────────────────────

function EditProjectDialog({
  project,
  open,
  onClose,
  onSuccess,
}: {
  project: Project;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [projectCode, setProjectCode] = useState(project.projectCode);
  const [type, setType] = useState(project.type);
  const [contractType, setContractType] = useState(project.contractType ?? "");
  const [contractValue, setContractValue] = useState(
    project.contractValue ? String(project.contractValue) : ""
  );
  const [status, setStatus] = useState(project.status);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const body: Record<string, unknown> = {};
      if (name !== project.name) body.name = name;
      if (projectCode !== project.projectCode)
        body.projectCode = projectCode.trim();
      if (type !== project.type) body.type = type;
      if (status !== project.status) body.status = status;

      const newContractType = contractType || null;
      if (newContractType !== project.contractType)
        body.contractType = newContractType;

      const parsedValue = contractValue
        ? parseFloat(contractValue.replace(/,/g, ""))
        : null;
      const existingValue = project.contractValue
        ? parseFloat(String(project.contractValue))
        : null;
      if (parsedValue !== existingValue) body.contractValue = parsedValue;

      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }

      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to update project.");
        return;
      }

      toast.success(`${project.name} has been updated.`);
      onClose();
      onSuccess();
    } catch {
      toast.error("Failed to update project.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>
            Update {project.name}&apos;s details.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-name">Project Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-code">Project Code</Label>
            <Input
              id="edit-code"
              value={projectCode}
              onChange={(e) => setProjectCode(e.target.value.toUpperCase())}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Project Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Contract Type (optional)</Label>
            <Select value={contractType} onValueChange={setContractType}>
              <SelectTrigger>
                <SelectValue placeholder="Select contract type" />
              </SelectTrigger>
              <SelectContent>
                {CONTRACT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-value">Contract Value (optional)</Label>
            <Input
              id="edit-value"
              value={contractValue}
              onChange={(e) => setContractValue(e.target.value)}
              placeholder="1,500,000"
              inputMode="decimal"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-status">Status</Label>
            <Input
              id="edit-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
