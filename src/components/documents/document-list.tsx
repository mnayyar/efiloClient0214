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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UploadDialog } from "./upload-dialog";
import { cn } from "@/lib/utils";

const TYPE_COLORS: Record<string, string> = {
  SPEC: "bg-blue-100 text-blue-800 border-blue-200",
  DRAWING: "bg-purple-100 text-purple-800 border-purple-200",
  ADDENDUM: "bg-orange-100 text-orange-800 border-orange-200",
  RFI: "bg-amber-100 text-amber-800 border-amber-200",
  CONTRACT: "bg-indigo-100 text-indigo-800 border-indigo-200",
  CHANGE: "bg-red-100 text-red-800 border-red-200",
  COMPLIANCE: "bg-green-100 text-green-800 border-green-200",
  MEETING: "bg-slate-100 text-slate-800 border-slate-200",
  FINANCIAL: "bg-emerald-100 text-emerald-800 border-emerald-200",
  SCHEDULE: "bg-cyan-100 text-cyan-800 border-cyan-200",
  CLOSEOUT: "bg-gray-100 text-gray-800 border-gray-200",
};

const STATUS_COLORS: Record<string, string> = {
  UPLOADING: "bg-gray-100 text-gray-600",
  PROCESSING: "bg-amber-100 text-amber-700",
  READY: "bg-green-100 text-green-700",
  ERROR: "bg-red-100 text-red-700",
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

export function DocumentList({ projectId }: { projectId: string }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "date" | "type">("date");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["documents", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/documents`);
      if (!res.ok) throw new Error("Failed to load documents");
      const json = await res.json();
      return json.data as Document[];
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

  // Listen for upload dialog event from project dashboard
  if (typeof window !== "undefined") {
    document.addEventListener("open-upload-dialog", () =>
      setUploadOpen(true)
    );
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

  const availableTypes = [...new Set(documents.map((d) => d.type))];

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-text-primary">Documents</h2>
          <Badge variant="secondary">{documents.length}</Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Type filter chips */}
          {availableTypes.length > 1 && (
            <div className="flex items-center gap-1">
              <Filter className="h-4 w-4 text-text-secondary" />
              <button
                onClick={() => setTypeFilter(null)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                  !typeFilter
                    ? "bg-brand-orange text-white"
                    : "bg-border-card text-text-secondary hover:text-text-primary"
                )}
              >
                All
              </button>
              {availableTypes.map((type) => (
                <button
                  key={type}
                  onClick={() =>
                    setTypeFilter(typeFilter === type ? null : type)
                  }
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                    typeFilter === type
                      ? TYPE_COLORS[type]
                      : "border-border-card text-text-secondary hover:text-text-primary"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          )}

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) =>
              setSortBy(e.target.value as "name" | "date" | "type")
            }
            className="rounded-md border border-border-card bg-white px-2 py-1 text-xs text-text-secondary"
          >
            <option value="date">Newest first</option>
            <option value="name">Name A-Z</option>
            <option value="type">By type</option>
          </select>

          <Button
            size="sm"
            onClick={() => setUploadOpen(true)}
          >
            <Upload className="mr-1.5 h-4 w-4" />
            Upload
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-card py-12">
          <FileText className="h-10 w-10 text-text-secondary" />
          <p className="text-sm text-text-secondary">
            {typeFilter
              ? `No ${typeFilter} documents found`
              : "No documents uploaded yet"}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setUploadOpen(true)}
          >
            Upload your first document
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-card bg-brand-off-white">
                <th className="px-4 py-3 text-left font-medium text-text-secondary">
                  Name
                </th>
                <th className="px-4 py-3 text-left font-medium text-text-secondary">
                  Type
                </th>
                <th className="px-4 py-3 text-left font-medium text-text-secondary">
                  Status
                </th>
                <th className="hidden px-4 py-3 text-left font-medium text-text-secondary sm:table-cell">
                  Size
                </th>
                <th className="hidden px-4 py-3 text-left font-medium text-text-secondary md:table-cell">
                  Uploaded
                </th>
                <th className="px-4 py-3 text-right font-medium text-text-secondary">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((doc) => (
                <tr
                  key={doc.id}
                  className="border-b border-border-card last:border-0 hover:bg-brand-off-white/50"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-text-secondary" />
                      <span className="truncate font-medium text-text-primary">
                        {doc.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                        TYPE_COLORS[doc.type] ?? "bg-gray-100 text-gray-600"
                      )}
                    >
                      {doc.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                        STATUS_COLORS[doc.status] ?? "bg-gray-100 text-gray-600"
                      )}
                    >
                      {doc.status === "PROCESSING" && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      {doc.status}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-text-secondary sm:table-cell">
                    {formatFileSize(doc.fileSize)}
                  </td>
                  <td className="hidden px-4 py-3 text-text-secondary md:table-cell">
                    {new Date(doc.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {doc.status === "READY" && (
                        <button
                          onClick={() => handleDownload(doc.id, doc.name)}
                          className="rounded p-1.5 text-text-secondary hover:text-text-primary"
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (confirm("Delete this document?")) {
                            deleteMutation.mutate(doc.id);
                          }
                        }}
                        className="rounded p-1.5 text-text-secondary hover:text-red-600"
                        title="Delete"
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
