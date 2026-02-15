"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { FolderOpen, Plus, Pencil } from "lucide-react";
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

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      const { data } = await res.json();
      setProjects(data);
    } catch {
      toast.error("Failed to load projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Projects</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Select a project to get started.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Project
        </Button>
      </div>

      {loading ? (
        <div className="mt-6 py-12 text-center text-text-secondary">
          Loading projects...
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="group relative rounded-lg border border-border-card bg-white p-5 transition-colors hover:border-brand-orange"
            >
              <Link
                href={`/projects/${project.id}`}
                className="absolute inset-0 rounded-lg"
              />
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-orange/10">
                  <FolderOpen className="h-5 w-5 text-brand-orange" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between">
                    <h3 className="truncate font-medium text-text-primary group-hover:text-brand-orange">
                      {project.name}
                    </h3>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditProject(project);
                      }}
                      className="relative z-10 rounded-md p-1 text-text-secondary opacity-0 transition-opacity hover:text-text-primary group-hover:opacity-100"
                      title="Edit project"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {project.projectCode}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {project.status}
                    </Badge>
                  </div>
                  <div className="mt-3 flex gap-4 text-xs text-text-secondary">
                    <span>{project._count.documents} docs</span>
                    <span>{project._count.rfis} RFIs</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {projects.length === 0 && (
            <div className="col-span-full py-12 text-center text-sm text-text-secondary">
              No projects yet. Click &quot;Add Project&quot; to create your first one.
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
            Create a new project. You can upload documents and start searching
            once the project is set up.
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

      // Handle contract type — send null to clear
      const newContractType = contractType || null;
      if (newContractType !== project.contractType)
        body.contractType = newContractType;

      // Handle contract value — send null to clear
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
