"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Download,
  Trash2,
  Loader2,
  Upload,
  Filter,
  File,
  Image,
  Sheet,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UploadDialog } from "./upload-dialog";
import { cn } from "@/lib/utils";

const TYPE_COLORS: Record<string, string> = {
  SPEC: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800",
  DRAWING: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800",
  ADDENDUM: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800",
  RFI: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
  CONTRACT: "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800",
  CHANGE: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800",
  COMPLIANCE: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/50 dark:text-green-300 dark:border-green-800",
  MEETING: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-950/50 dark:text-slate-300 dark:border-slate-800",
  FINANCIAL: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
  SCHEDULE: "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-300 dark:border-cyan-800",
  CLOSEOUT: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-950/50 dark:text-gray-300 dark:border-gray-800",
};

const STATUS_CONFIG: Record<string, { color: string; icon: typeof CheckCircle2 | typeof Loader2 | typeof Clock }> = {
  UPLOADING: { color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300", icon: Clock },
  PROCESSING: { color: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300", icon: Loader2 },
  READY: { color: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300", icon: CheckCircle2 },
  ERROR: { color: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300", icon: Clock },
};

interface Document {
  id: string;
  name: string;
  type: string;
  status: string;
  pageCount: number | null;
  fileSize: number;
  createdAt: string;
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return <FileText className="h-4 w-4 text-red-500" />;
  if (ext === "docx") return <File className="h-4 w-4 text-blue-500" />;
  if (ext === "xlsx") return <Sheet className="h-4 w-4 text-green-500" />;
  if (["png", "jpg", "jpeg"].includes(ext ?? ""))
    return <Image className="h-4 w-4 text-purple-500" />;
  return <FileText className="h-4 w-4 text-text-secondary" />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentList({ projectId }: { projectId: string }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "date" | "type">("date");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["documents", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/documents`);
      if (!res.ok) throw new Error("Failed to load documents");
      const json = await res.json();
      return json.data as Document[];
    },
    // Poll every 5s while any document is still processing
    refetchInterval: (query) => {
      const docs = query.state.data;
      const hasProcessing = docs?.some(
        (d) => d.status === "PROCESSING" || d.status === "UPLOADING"
      );
      return hasProcessing ? 5000 : false;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      const res = await fetch(
        `/api/projects/${projectId}/documents/${docId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete document");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", projectId] });
      toast.success("Document deleted");
    },
    onError: () => {
      toast.error("Failed to delete document");
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (documentIds: string[]) => {
      const res = await fetch(
        `/api/projects/${projectId}/documents/bulk-delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentIds }),
        }
      );
      if (!res.ok) throw new Error("Bulk delete failed");
      return res.json();
    },
    onSuccess: (result) => {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["documents", projectId] });
      toast.success(
        `${result.data.deleted} document${result.data.deleted !== 1 ? "s" : ""} deleted`
      );
    },
    onError: () => {
      toast.error("Failed to delete selected documents");
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/documents/reprocess`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("Failed to reprocess documents");
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["documents", projectId] });
      toast.success(
        `${result.data.requeued} document${result.data.requeued !== 1 ? "s" : ""} queued for re-processing`
      );
    },
    onError: () => {
      toast.error("Failed to re-process documents");
    },
  });

  async function handleDownload(docId: string, name: string) {
    const res = await fetch(
      `/api/projects/${projectId}/documents/${docId}/download`
    );
    if (!res.ok) return;
    const { data } = await res.json();
    const link = document.createElement("a");
    link.href = data.downloadUrl;
    link.download = name;
    link.click();
  }

  function toggleSelect(docId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === sorted.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sorted.map((d) => d.id)));
    }
  }

  function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (
      confirm(
        `Delete ${count} document${count !== 1 ? "s" : ""}? This will permanently remove all files, extracted content, and embeddings.`
      )
    ) {
      bulkDeleteMutation.mutate(Array.from(selectedIds));
    }
  }

  const documents = data ?? [];
  const filtered = typeFilter
    ? documents.filter((d) => d.type === typeFilter)
    : documents;

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "type") return a.type.localeCompare(b.type);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const availableTypes = [...new Set(documents.map((d) => d.type))].sort();
  const readyCount = documents.filter((d) => d.status === "READY").length;
  const processingCount = documents.filter((d) => d.status === "PROCESSING").length;
  const allSelected = sorted.length > 0 && selectedIds.size === sorted.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < sorted.length;
  const isDeleting = deleteMutation.isPending || bulkDeleteMutation.isPending;

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-text-primary">Documents</h2>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary">{documents.length} total</Badge>
            {readyCount > 0 && (
              <Badge variant="outline" className="border-green-200 text-green-700 dark:border-green-800 dark:text-green-300">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                {readyCount} indexed
              </Badge>
            )}
            {processingCount > 0 && (
              <Badge variant="outline" className="border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-300">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                {processingCount} processing
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Bulk delete */}
          {selectedIds.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={isDeleting}
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-4 w-4" />
              )}
              Delete {selectedIds.size} selected
            </Button>
          )}

          {/* Type filter */}
          {availableTypes.length > 1 && (
            <Select
              value={typeFilter ?? "ALL"}
              onValueChange={(v) => setTypeFilter(v === "ALL" ? null : v)}
            >
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <Filter className="mr-1 h-3 w-3" />
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                {availableTypes.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Sort */}
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as "name" | "date" | "type")}
          >
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Newest first</SelectItem>
              <SelectItem value="name">Name A-Z</SelectItem>
              <SelectItem value="type">By type</SelectItem>
            </SelectContent>
          </Select>

          {readyCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (confirm("Re-process all documents? This will re-extract text and regenerate search embeddings.")) {
                  reprocessMutation.mutate();
                }
              }}
              disabled={reprocessMutation.isPending}
            >
              <RefreshCw className={cn("mr-1.5 h-4 w-4", reprocessMutation.isPending && "animate-spin")} />
              Re-process All
            </Button>
          )}

          {sorted.length > 0 && (
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Upload className="mr-1.5 h-4 w-4" />
              Upload
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        /* ── Empty state ──────────────────────────────── */
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border-card py-16 px-6">
          <div className="relative">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-500 shadow-lg shadow-indigo-500/20">
              <FileText className="h-8 w-8 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand-orange shadow-md">
              <Upload className="h-3 w-3 text-white" />
            </div>
          </div>
          <div className="text-center">
            <h3 className="text-base font-semibold text-text-primary">
              {typeFilter
                ? `No ${typeFilter} documents found`
                : "Upload Your Project Documents"}
            </h3>
            <p className="mt-1 max-w-sm text-sm text-text-secondary">
              {typeFilter
                ? "Try clearing the filter or uploading more documents."
                : "Upload specs, drawings, contracts, and other project files. Our AI pipeline will extract text, generate embeddings, and make everything searchable."}
            </p>
          </div>
          {!typeFilter && (
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              {[
                { icon: Upload, title: "Drag & drop upload", desc: "PDF, DOCX, XLSX, images" },
                { icon: Search, title: "AI-powered search", desc: "Ask questions about docs" },
                { icon: CheckCircle2, title: "Auto-processing", desc: "Text extraction & indexing" },
              ].map((f) => (
                <div
                  key={f.title}
                  className="flex flex-col items-center rounded-lg border border-border-card bg-brand-off-white/50 px-4 py-3 text-center dark:bg-muted/50"
                >
                  <f.icon className="h-4 w-4 text-brand-orange" />
                  <p className="mt-1.5 text-xs font-semibold text-text-primary">{f.title}</p>
                  <p className="mt-0.5 text-[11px] text-text-secondary">{f.desc}</p>
                </div>
              ))}
            </div>
          )}
          <Button onClick={() => setUploadOpen(true)} size="lg" className="mt-2">
            <Upload className="mr-2 h-4 w-4" />
            {typeFilter ? "Upload Document" : "Upload Documents"}
          </Button>
        </div>
      ) : (
        /* ── Table ─────────────────────────────────────── */
        <div className="overflow-hidden rounded-lg border border-border-card">
          {/* Selection bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between border-b border-border-card bg-blue-50 px-4 py-2 dark:bg-blue-950/30">
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-blue-800 dark:text-blue-300">
                  {selectedIds.size} document{selectedIds.size !== 1 ? "s" : ""} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear selection
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setSelectedIds(new Set(sorted.map((d) => d.id)))}
                >
                  Select all {sorted.length}
                </Button>
              </div>
            </div>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-card bg-brand-off-white dark:bg-muted">
                <th className="w-10 px-3 py-3">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all documents"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-text-secondary">Name</th>
                <th className="px-4 py-3 text-left font-medium text-text-secondary">Type</th>
                <th className="px-4 py-3 text-left font-medium text-text-secondary">Status</th>
                <th className="hidden px-4 py-3 text-left font-medium text-text-secondary sm:table-cell">Size</th>
                <th className="hidden px-4 py-3 text-left font-medium text-text-secondary md:table-cell">Pages</th>
                <th className="hidden px-4 py-3 text-left font-medium text-text-secondary lg:table-cell">Uploaded</th>
                <th className="px-4 py-3 text-right font-medium text-text-secondary">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((doc) => {
                const statusCfg = STATUS_CONFIG[doc.status];
                const StatusIcon = statusCfg?.icon;
                const isSelected = selectedIds.has(doc.id);

                return (
                  <tr
                    key={doc.id}
                    className={cn(
                      "border-b border-border-card last:border-0 transition-colors",
                      isSelected
                        ? "bg-blue-50/50 dark:bg-blue-950/20"
                        : "hover:bg-brand-off-white/50 dark:hover:bg-muted/50"
                    )}
                  >
                    <td className="w-10 px-3 py-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(doc.id)}
                        aria-label={`Select ${doc.name}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {getFileIcon(doc.name)}
                        <span className="truncate font-medium text-text-primary max-w-[250px]">
                          {doc.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                          TYPE_COLORS[doc.type] ?? "bg-gray-100 text-gray-600"
                        )}
                      >
                        {doc.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                          statusCfg?.color ?? "bg-gray-100 text-gray-600"
                        )}
                      >
                        {StatusIcon && (
                          <StatusIcon
                            className={cn(
                              "h-3 w-3",
                              doc.status === "PROCESSING" && "animate-spin"
                            )}
                          />
                        )}
                        {doc.status}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-text-secondary sm:table-cell">
                      {formatFileSize(doc.fileSize)}
                    </td>
                    <td className="hidden px-4 py-3 text-text-secondary md:table-cell">
                      {doc.pageCount ?? "—"}
                    </td>
                    <td className="hidden px-4 py-3 text-text-secondary lg:table-cell">
                      {new Date(doc.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {doc.status === "READY" && (
                          <button
                            onClick={() => handleDownload(doc.id, doc.name)}
                            className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-border-card hover:text-text-primary"
                            title="Download"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm("Delete this document? This will remove all extracted content and embeddings.")) {
                              deleteMutation.mutate(doc.id);
                            }
                          }}
                          className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                          title="Delete"
                          disabled={isDeleting}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <UploadDialog
        projectId={projectId}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploadComplete={() =>
          queryClient.invalidateQueries({ queryKey: ["documents", projectId] })
        }
      />
    </div>
  );
}
