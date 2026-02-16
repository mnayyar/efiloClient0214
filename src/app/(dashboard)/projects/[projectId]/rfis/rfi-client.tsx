"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileWarning,
  Plus,
  Filter,
  Loader2,
  AlertCircle,
  Clock,
  ChevronRight,
  ArrowRight,
  Sparkles,
  FileText,
  Trash2,
  X,
  Brain,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface RFI {
  id: string;
  rfiNumber: string;
  subject: string;
  question: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  dueDate: string | null;
  submittedAt: string | null;
  respondedAt: string | null;
  response: string | null;
  aiDraftQuestion: string | null;
  aiDraftModel: string | null;
  aiResponseAnalysis: string | null;
  coFlag: boolean;
  coEstimate: number | null;
  isOverdue: boolean;
  sourceDocIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface ProjectDocument {
  id: string;
  name: string;
  type: string;
  status: string;
}

interface RfiClientProps {
  projectId: string;
}

const STATUS_OPTIONS = [
  "DRAFT",
  "SUBMITTED",
  "PENDING_GC",
  "OPEN",
  "ANSWERED",
  "CLOSED",
  "VOID",
] as const;

const PRIORITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
  SUBMITTED: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800",
  PENDING_GC: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
  OPEN: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
  ANSWERED: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800",
  CLOSED: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  VOID: "bg-red-100 text-red-600 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800",
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  MEDIUM: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
  CRITICAL: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
};

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function RfiPageClient({ projectId }: RfiClientProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [detailRfi, setDetailRfi] = useState<RFI | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["rfis", projectId, statusFilter, priorityFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (priorityFilter) params.set("priority", priorityFilter);
      const qs = params.toString();
      const res = await fetch(
        `/api/projects/${projectId}/rfis${qs ? `?${qs}` : ""}`
      );
      if (!res.ok) throw new Error("Failed to load RFIs");
      const json = await res.json();
      return json.data as RFI[];
    },
  });

  const rfis = data ?? [];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-card px-6 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-text-primary">
            Notices & RFI
          </h2>
          <Badge variant="secondary">{rfis.length}</Badge>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={statusFilter ?? "ALL"}
            onValueChange={(v) => setStatusFilter(v === "ALL" ? null : v)}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <Filter className="mr-1 h-3 w-3" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {formatStatus(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={priorityFilter ?? "ALL"}
            onValueChange={(v) => setPriorityFilter(v === "ALL" ? null : v)}
          >
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Priorities</SelectItem>
              {PRIORITY_OPTIONS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {rfis.length > 0 && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Create RFI
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : rfis.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6">
            {statusFilter || priorityFilter ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-card py-12 px-8">
                <Filter className="h-8 w-8 text-text-secondary" />
                <p className="text-sm text-text-secondary">
                  No RFIs match the current filters
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStatusFilter(null);
                    setPriorityFilter(null);
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            ) : (
              <div className="w-full max-w-lg">
                <div className="flex justify-center">
                  <div className="relative">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-orange-500/20">
                      <FileWarning className="h-8 w-8 text-white" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand-orange shadow-md">
                      <Plus className="h-3.5 w-3.5 text-white" />
                    </div>
                  </div>
                </div>
                <h3 className="mt-5 text-center text-lg font-semibold text-text-primary">
                  Track Requests for Information
                </h3>
                <p className="mt-1.5 text-center text-sm leading-relaxed text-text-secondary">
                  Create and manage RFIs to get clarifications on project documents.
                  Track status, assign to parties, and monitor response timelines.
                </p>
                <div className="mt-6 grid grid-cols-3 gap-3">
                  {[
                    { icon: Clock, title: "Due Date Tracking", desc: "Monitor response deadlines" },
                    { icon: AlertCircle, title: "Priority Levels", desc: "Low to Critical urgency" },
                    { icon: ArrowRight, title: "Status Workflow", desc: "Draft to Closed lifecycle" },
                  ].map((feature) => (
                    <div
                      key={feature.title}
                      className="flex flex-col items-center rounded-lg border border-border-card bg-brand-off-white/50 px-3 py-4 text-center dark:bg-muted/50"
                    >
                      <feature.icon className="h-4 w-4 text-brand-orange" />
                      <p className="mt-2 text-xs font-semibold text-text-primary">{feature.title}</p>
                      <p className="mt-0.5 text-[11px] text-text-secondary">{feature.desc}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex justify-center">
                  <Button onClick={() => setCreateOpen(true)} size="lg">
                    <Plus className="mr-2 h-4 w-4" />
                    Create RFI
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-card bg-brand-off-white dark:bg-muted">
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">RFI #</th>
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Subject</th>
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Priority</th>
                  <th className="hidden px-4 py-3 text-left font-medium text-text-secondary md:table-cell">Assigned To</th>
                  <th className="hidden px-4 py-3 text-left font-medium text-text-secondary lg:table-cell">Due Date</th>
                  <th className="hidden px-4 py-3 text-left font-medium text-text-secondary sm:table-cell">Created</th>
                  <th className="px-4 py-3 text-right font-medium text-text-secondary"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rfis.map((rfi) => (
                  <tr
                    key={rfi.id}
                    onClick={() => setDetailRfi(rfi)}
                    className="cursor-pointer border-b border-border-card last:border-0 transition-colors hover:bg-brand-off-white/50 dark:hover:bg-muted/50"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-brand-orange">{rfi.rfiNumber}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-text-primary max-w-[300px]">{rfi.subject}</span>
                        {rfi.isOverdue && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                        {rfi.coFlag && (
                          <Badge variant="outline" className="shrink-0 text-[10px] border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">CO</Badge>
                        )}
                        {rfi.aiResponseAnalysis && (
                          <Brain className="h-3.5 w-3.5 shrink-0 text-purple-500" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium", STATUS_COLORS[rfi.status] ?? "bg-gray-100 text-gray-600")}>
                        {formatStatus(rfi.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", PRIORITY_COLORS[rfi.priority] ?? "bg-gray-100 text-gray-600")}>
                        {rfi.priority}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-text-secondary md:table-cell">{rfi.assignedTo || "—"}</td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      {rfi.dueDate ? (
                        <span className={cn("flex items-center gap-1 text-text-secondary", rfi.isOverdue && "text-red-500 font-medium")}>
                          <Clock className="h-3 w-3" />
                          {formatDate(rfi.dueDate)}
                        </span>
                      ) : (
                        <span className="text-text-secondary">—</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-text-secondary sm:table-cell">{formatDate(rfi.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight className="inline h-4 w-4 text-text-secondary" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateRfiDialog
        projectId={projectId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["rfis", projectId] });
        }}
      />

      <RfiDetailDialog
        projectId={projectId}
        rfi={detailRfi}
        onClose={() => setDetailRfi(null)}
        onUpdated={() => {
          queryClient.invalidateQueries({ queryKey: ["rfis", projectId] });
        }}
      />
    </div>
  );
}

/* ── Create RFI Dialog ──────────────────────────────────────── */

function CreateRfiDialog({
  projectId,
  open,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [showDocPicker, setShowDocPicker] = useState(false);

  // Fetch project documents for linking
  const { data: documents } = useQuery({
    queryKey: ["documents", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/documents`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.data as ProjectDocument[];
    },
    enabled: open,
  });

  const readyDocs = (documents ?? []).filter((d) => d.status === "READY");

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        subject,
        question,
        priority,
      };
      if (assignedTo.trim()) body.assignedTo = assignedTo.trim();
      if (dueDate) body.dueDate = new Date(dueDate).toISOString();
      if (selectedDocIds.length > 0) body.sourceDocIds = selectedDocIds;

      const res = await fetch(`/api/projects/${projectId}/rfis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create RFI");
      }

      return res.json();
    },
    onSuccess: () => {
      toast.success("RFI created successfully");
      onCreated();
      onOpenChange(false);
      resetForm();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  function resetForm() {
    setSubject("");
    setQuestion("");
    setPriority("MEDIUM");
    setAssignedTo("");
    setDueDate("");
    setSelectedDocIds([]);
    setShowDocPicker(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create RFI</DialogTitle>
          <DialogDescription>
            Create a new Request for Information. It will start as a Draft.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="flex flex-col gap-4 pt-2"
        >
          {/* Subject */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rfi-subject">Subject *</Label>
            <Input
              id="rfi-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Clarification on HVAC duct routing at Level 3"
              required
            />
          </div>

          {/* Question */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rfi-question">Question *</Label>
            <textarea
              id="rfi-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Describe the information you need..."
              required
              rows={4}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          {/* Priority + Assigned To row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rfi-assigned">Assigned To</Label>
              <Input
                id="rfi-assigned"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                placeholder="Name or company"
              />
            </div>
          </div>

          {/* Due Date */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rfi-due">Due Date</Label>
            <Input
              id="rfi-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          {/* Document Linking */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Source Documents</Label>
              {readyDocs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowDocPicker(!showDocPicker)}
                  className="text-xs font-medium text-brand-orange hover:underline"
                >
                  {showDocPicker ? "Hide" : "Link Documents"}
                </button>
              )}
            </div>

            {/* Selected docs chips */}
            {selectedDocIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedDocIds.map((docId) => {
                  const doc = readyDocs.find((d) => d.id === docId);
                  return (
                    <span
                      key={docId}
                      className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                    >
                      <FileText className="h-3 w-3" />
                      {doc?.name ?? docId}
                      <button
                        type="button"
                        onClick={() => setSelectedDocIds((ids) => ids.filter((id) => id !== docId))}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Doc picker list */}
            {showDocPicker && (
              <div className="max-h-32 overflow-y-auto rounded-md border border-border-card">
                {readyDocs.map((doc) => {
                  const isSelected = selectedDocIds.includes(doc.id);
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => {
                        setSelectedDocIds((ids) =>
                          isSelected
                            ? ids.filter((id) => id !== doc.id)
                            : [...ids, doc.id]
                        );
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-brand-off-white dark:hover:bg-muted",
                        isSelected && "bg-blue-50 dark:bg-blue-950/30"
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          isSelected
                            ? "border-brand-orange bg-brand-orange text-white"
                            : "border-border-card"
                        )}
                      >
                        {isSelected && <span className="text-[10px]">✓</span>}
                      </div>
                      <FileText className="h-3 w-3 shrink-0 text-text-secondary" />
                      <span className="truncate text-text-primary">{doc.name}</span>
                      <Badge variant="outline" className="ml-auto shrink-0 text-[9px]">{doc.type}</Badge>
                    </button>
                  );
                })}
                {readyDocs.length === 0 && (
                  <p className="px-3 py-4 text-center text-xs text-text-secondary">
                    No documents available
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || !subject.trim() || !question.trim()}
            >
              {createMutation.isPending && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              Create RFI
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── RFI Detail Dialog ──────────────────────────────────────── */

function RfiDetailDialog({
  projectId,
  rfi,
  onClose,
  onUpdated,
}: {
  projectId: string;
  rfi: RFI | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [editingStatus, setEditingStatus] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [showResponseInput, setShowResponseInput] = useState(false);

  // Fetch linked document names
  const { data: linkedDocs } = useQuery({
    queryKey: ["linked-docs", rfi?.id],
    queryFn: async () => {
      if (!rfi || rfi.sourceDocIds.length === 0) return [];
      const res = await fetch(`/api/projects/${projectId}/documents`);
      if (!res.ok) return [];
      const json = await res.json();
      const allDocs = json.data as ProjectDocument[];
      return allDocs.filter((d) => rfi.sourceDocIds.includes(d.id));
    },
    enabled: !!rfi && rfi.sourceDocIds.length > 0,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch(
        `/api/projects/${projectId}/rfis/${rfi!.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update RFI");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("RFI updated");
      onUpdated();
      onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/rfis/${rfi!.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete RFI");
      }
    },
    onSuccess: () => {
      toast.success("RFI deleted");
      onUpdated();
      onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const aiDraftMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/rfis/${rfi!.id}/ai-draft`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate AI draft");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success("AI draft generated");
      onUpdated();
      // Don't close — show the draft in the dialog
      if (rfi) {
        rfi.aiDraftQuestion = data.data.draft;
        rfi.aiDraftModel = data.data.model;
      }
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const analyzeResponseMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/rfis/${rfi!.id}/analyze-response`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to analyze response");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success("Response analyzed");
      onUpdated();
      if (rfi) {
        rfi.aiResponseAnalysis = data.data.analysis;
        if (data.data.coDetected) rfi.coFlag = true;
      }
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  if (!rfi) return null;

  return (
    <Dialog open={!!rfi} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-brand-orange">RFI-{rfi.rfiNumber}</span>
            <span className="text-text-primary">{rfi.subject}</span>
          </DialogTitle>
          <DialogDescription>
            Created {formatDate(rfi.createdAt)}
            {rfi.assignedTo && ` · Assigned to ${rfi.assignedTo}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 pt-2">
          {/* Status + Priority badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium", STATUS_COLORS[rfi.status])}>
              {formatStatus(rfi.status)}
            </span>
            <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", PRIORITY_COLORS[rfi.priority])}>
              {rfi.priority}
            </span>
            {rfi.isOverdue && (
              <Badge variant="destructive" className="text-[10px]">OVERDUE</Badge>
            )}
            {rfi.coFlag && (
              <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">
                Change Order{rfi.coEstimate ? ` · $${Number(rfi.coEstimate).toLocaleString()}` : ""}
              </Badge>
            )}
            {rfi.dueDate && (
              <span className="flex items-center gap-1 text-xs text-text-secondary">
                <Clock className="h-3 w-3" />
                Due {formatDate(rfi.dueDate)}
              </span>
            )}
          </div>

          {/* Linked Documents */}
          {linkedDocs && linkedDocs.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Linked Documents
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {linkedDocs.map((doc) => (
                  <span
                    key={doc.id}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                  >
                    <FileText className="h-3 w-3" />
                    {doc.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Question */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Question
              </h4>
              {rfi.status === "DRAFT" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 text-[11px] text-purple-600 hover:text-purple-700"
                  onClick={() => aiDraftMutation.mutate()}
                  disabled={aiDraftMutation.isPending}
                >
                  {aiDraftMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  AI Draft
                </Button>
              )}
            </div>
            <p className="whitespace-pre-wrap rounded-md border border-border-card bg-brand-off-white p-3 text-sm text-text-primary dark:bg-muted">
              {rfi.question}
            </p>
          </div>

          {/* AI Draft Question */}
          {rfi.aiDraftQuestion && (
            <div>
              <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-purple-600">
                <Sparkles className="h-3 w-3" />
                AI-Generated Draft
              </h4>
              <div className="whitespace-pre-wrap rounded-md border border-purple-200 bg-purple-50 p-3 text-sm text-text-primary dark:border-purple-800 dark:bg-purple-950/20">
                {rfi.aiDraftQuestion}
              </div>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-[10px] text-text-secondary">
                  Generated by {rfi.aiDraftModel}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] text-brand-orange"
                  onClick={() => {
                    updateMutation.mutate({ question: rfi.aiDraftQuestion });
                  }}
                  disabled={updateMutation.isPending}
                >
                  Use as Question
                </Button>
              </div>
            </div>
          )}

          {/* Response */}
          {rfi.response ? (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Response
                </h4>
                {!rfi.aiResponseAnalysis && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 text-[11px] text-purple-600 hover:text-purple-700"
                    onClick={() => analyzeResponseMutation.mutate()}
                    disabled={analyzeResponseMutation.isPending}
                  >
                    {analyzeResponseMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Brain className="h-3 w-3" />
                    )}
                    Analyze Response
                  </Button>
                )}
              </div>
              <p className="whitespace-pre-wrap rounded-md border border-border-card bg-emerald-50 p-3 text-sm text-text-primary dark:bg-emerald-950/20">
                {rfi.response}
              </p>
              {rfi.respondedAt && (
                <p className="mt-1 text-[11px] text-text-secondary">
                  Responded {formatDate(rfi.respondedAt)}
                </p>
              )}
            </div>
          ) : (
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Response
              </h4>
              {showResponseInput ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    placeholder="Enter the response received..."
                    rows={3}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!responseText.trim() || updateMutation.isPending}
                      onClick={() => {
                        updateMutation.mutate({
                          response: responseText,
                          status: "ANSWERED",
                        });
                      }}
                    >
                      {updateMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      Save Response
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setShowResponseInput(false);
                        setResponseText("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowResponseInput(true)}
                  className="w-full rounded-md border border-dashed border-border-card p-3 text-center text-xs text-text-secondary transition-colors hover:border-brand-orange hover:text-text-primary"
                >
                  + Add Response
                </button>
              )}
            </div>
          )}

          {/* AI Response Analysis */}
          {rfi.aiResponseAnalysis && (
            <div>
              <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-purple-600">
                <Brain className="h-3 w-3" />
                AI Response Analysis
              </h4>
              <div className="whitespace-pre-wrap rounded-md border border-purple-200 bg-purple-50 p-3 text-sm text-text-primary dark:border-purple-800 dark:bg-purple-950/20">
                {rfi.aiResponseAnalysis}
              </div>
            </div>
          )}

          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-2 border-t border-border-card pt-3">
            <span className="text-xs font-medium text-text-secondary">
              Status:
            </span>
            {editingStatus ? (
              <Select
                value={rfi.status}
                onValueChange={(v) => {
                  updateMutation.mutate({ status: v });
                  setEditingStatus(false);
                }}
              >
                <SelectTrigger className="h-7 w-[150px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{formatStatus(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setEditingStatus(true)}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                Change Status
              </Button>
            )}

            {/* Delete */}
            <div className="ml-auto">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                onClick={() => {
                  if (confirm("Are you sure you want to delete this RFI? This cannot be undone.")) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                Delete
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
