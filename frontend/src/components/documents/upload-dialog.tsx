import { useState, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload,
  X,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  File,
  Image,
  Sheet,
  AlertTriangle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DOCUMENT_TYPES = [
  { value: "SPEC", label: "Specification" },
  { value: "DRAWING", label: "Drawing" },
  { value: "ADDENDUM", label: "Addendum" },
  { value: "RFI", label: "RFI" },
  { value: "CONTRACT", label: "Contract" },
  { value: "CHANGE", label: "Change Order" },
  { value: "COMPLIANCE", label: "Compliance" },
  { value: "MEETING", label: "Meeting Minutes" },
  { value: "FINANCIAL", label: "Financial" },
  { value: "SCHEDULE", label: "Schedule" },
  { value: "CLOSEOUT", label: "Closeout" },
] as const;

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_FILES_PER_BATCH = 10;
const ACCEPTED_TYPES = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};

type FileStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "ready"
  | "error"
  | "duplicate"
  | "skipped";

interface QueuedFile {
  file: File;
  docType: string;
  status: FileStatus;
  progress: number;
  error?: string;
  docId?: string;
}

function getFileIcon(name: string, size: "sm" | "md" = "sm") {
  const ext = name.split(".").pop()?.toLowerCase();
  const cls = size === "md" ? "h-5 w-5" : "h-4 w-4";
  if (ext === "pdf") return <FileText className={cn(cls, "text-red-500")} />;
  if (ext === "docx") return <File className={cn(cls, "text-blue-500")} />;
  if (ext === "xlsx") return <Sheet className={cn(cls, "text-green-500")} />;
  if (["png", "jpg", "jpeg"].includes(ext ?? ""))
    return <Image className={cn(cls, "text-purple-500")} />;
  return <FileText className={cn(cls, "text-text-secondary")} />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function guessDocType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("spec")) return "SPEC";
  if (lower.includes("drawing") || lower.includes("dwg")) return "DRAWING";
  if (lower.includes("addendum")) return "ADDENDUM";
  if (lower.includes("rfi")) return "RFI";
  if (lower.includes("contract")) return "CONTRACT";
  if (lower.includes("change") || lower.includes("co-")) return "CHANGE";
  if (lower.includes("compliance")) return "COMPLIANCE";
  if (lower.includes("meeting") || lower.includes("minutes")) return "MEETING";
  if (lower.includes("financial") || lower.includes("invoice"))
    return "FINANCIAL";
  if (lower.includes("schedule")) return "SCHEDULE";
  if (lower.includes("closeout")) return "CLOSEOUT";
  return "SPEC";
}

interface UploadDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadComplete?: () => void;
}

export function UploadDialog({
  projectId,
  open,
  onOpenChange,
  onUploadComplete,
}: UploadDialogProps) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const onDrop = useCallback((accepted: File[]) => {
    setGlobalError(null);
    setQueue((prev) => {
      const existingNames = new Set(prev.map((q) => q.file.name));
      const newFiles = accepted.filter((f) => !existingNames.has(f.name));
      const total = prev.length + newFiles.length;
      if (total > MAX_FILES_PER_BATCH) {
        setGlobalError(
          `Maximum ${MAX_FILES_PER_BATCH} files per upload. You selected ${total}.`
        );
        return prev;
      }
      return [
        ...prev,
        ...newFiles.map((file) => ({
          file,
          docType: guessDocType(file.name),
          status: "pending" as FileStatus,
          progress: 0,
        })),
      ];
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_FILE_SIZE,
    multiple: true,
    disabled: isProcessing,
    onDropRejected: (rejections) => {
      const messages = rejections.map((r) => {
        const err = r.errors[0];
        if (err?.code === "file-too-large")
          return `${r.file.name}: exceeds 100MB`;
        if (err?.code === "file-invalid-type")
          return `${r.file.name}: unsupported type`;
        return `${r.file.name}: ${err?.message ?? "rejected"}`;
      });
      setGlobalError(messages.join(". "));
    },
  });

  function removeFile(index: number) {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  }

  function updateFileType(index: number, docType: string) {
    setQueue((prev) =>
      prev.map((q, i) => (i === index ? { ...q, docType } : q))
    );
  }

  function updateQueueItem(index: number, updates: Partial<QueuedFile>) {
    setQueue((prev) =>
      prev.map((q, i) => (i === index ? { ...q, ...updates } : q))
    );
  }

  async function processQueue() {
    setIsProcessing(true);
    abortRef.current = false;

    const pendingIndices = queue
      .map((q, i) => ({ q, i }))
      .filter(({ q }) => q.status === "pending")
      .map(({ i }) => i);

    for (const idx of pendingIndices) {
      if (abortRef.current) break;

      const item = queue[idx];
      try {
        updateQueueItem(idx, { status: "uploading", progress: 0 });

        let presignRes = await fetch(
          `/api/projects/${projectId}/documents`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: item.file.name,
              type: item.docType,
              mimeType: item.file.type,
              fileSize: item.file.size,
            }),
          }
        );

        if (!presignRes.ok) {
          const errData = await presignRes.json();
          if (errData.error === "duplicate") {
            updateQueueItem(idx, { status: "uploading", progress: 0 });
            presignRes = await fetch(
              `/api/projects/${projectId}/documents`,
              {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: item.file.name,
                  type: item.docType,
                  mimeType: item.file.type,
                  fileSize: item.file.size,
                  replace: true,
                }),
              }
            );
            if (!presignRes.ok) {
              const retryErr = await presignRes.json();
              throw new Error(
                retryErr.error || "Failed to replace document"
              );
            }
          } else {
            throw new Error(errData.error || "Failed to prepare upload");
          }
        }

        const { data } = await presignRes.json();
        updateQueueItem(idx, { docId: data.documentId });

        // Upload to R2
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              updateQueueItem(idx, {
                progress: Math.round((e.loaded / e.total) * 100),
              });
            }
          });
          xhr.open("PUT", data.uploadUrl);
          xhr.setRequestHeader("Content-Type", item.file.type);
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Upload failed: ${xhr.status}`));
          };
          xhr.onerror = () =>
            reject(new Error("Network error during upload"));
          xhr.send(item.file);
        });

        // Confirm → triggers ingestion pipeline
        updateQueueItem(idx, { status: "processing", progress: 100 });

        const confirmRes = await fetch(
          `/api/projects/${projectId}/documents/${data.documentId}/confirm`,
          { method: "POST", credentials: "include" }
        );

        if (!confirmRes.ok) {
          throw new Error("Failed to confirm upload");
        }

        updateQueueItem(idx, { status: "ready" });
      } catch (err) {
        updateQueueItem(idx, {
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    }

    setIsProcessing(false);
    onUploadComplete?.();
  }

  function handleReset() {
    setQueue([]);
    setIsProcessing(false);
    setGlobalError(null);
    abortRef.current = false;
  }

  function handleClose() {
    if (isProcessing) return;
    handleReset();
    onOpenChange(false);
  }

  const pendingCount = queue.filter((q) => q.status === "pending").length;
  const completedCount = queue.filter((q) => q.status === "ready").length;
  const errorCount = queue.filter((q) => q.status === "error").length;
  const dupCount = queue.filter((q) => q.status === "duplicate").length;
  const allDone = queue.length > 0 && pendingCount === 0 && !isProcessing;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
          <DialogDescription>
            Upload up to {MAX_FILES_PER_BATCH} files at once. Files are
            processed sequentially through the AI ingestion pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isProcessing && !allDone && (
            <div
              {...getRootProps()}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 transition-all",
                isDragActive
                  ? "border-brand-orange bg-brand-orange/5 scale-[1.01]"
                  : "border-border-card hover:border-brand-orange/50 hover:bg-brand-off-white dark:hover:bg-muted/50"
              )}
            >
              <input {...getInputProps()} />
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-orange/20 to-brand-orange/5">
                <Upload className="h-5 w-5 text-brand-orange" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-text-primary">
                  {isDragActive
                    ? "Drop files here"
                    : queue.length > 0
                      ? "Add more files"
                      : "Drag & drop documents"}
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  or{" "}
                  <span className="font-medium text-brand-orange">
                    browse files
                  </span>{" "}
                  — PDF, DOCX, XLSX, PNG, JPEG up to 100MB each
                </p>
              </div>
            </div>
          )}

          {globalError && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {globalError}
              </p>
            </div>
          )}

          {queue.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-text-primary">
                    {queue.length} {queue.length === 1 ? "file" : "files"}
                  </span>
                  {allDone && (
                    <div className="flex gap-1.5">
                      {completedCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-950/50 dark:text-green-300">
                          <CheckCircle2 className="h-3 w-3" />{" "}
                          {completedCount} uploaded
                        </span>
                      )}
                      {dupCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                          <AlertTriangle className="h-3 w-3" /> {dupCount}{" "}
                          duplicate{dupCount > 1 ? "s" : ""}
                        </span>
                      )}
                      {errorCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950/50 dark:text-red-300">
                          <AlertCircle className="h-3 w-3" /> {errorCount}{" "}
                          failed
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {!isProcessing && !allDone && queue.length > 1 && (
                  <button
                    onClick={() => setQueue([])}
                    className="text-xs text-text-secondary hover:text-text-primary"
                  >
                    Clear all
                  </button>
                )}
              </div>

              <div className="max-h-[320px] overflow-y-auto rounded-lg border border-border-card divide-y divide-border-card">
                {queue.map((item, idx) => (
                  <div
                    key={`${item.file.name}-${idx}`}
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-card bg-card">
                      {getFileIcon(item.file.name, "md")}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {item.file.name}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-text-secondary">
                          {formatFileSize(item.file.size)}
                        </span>

                        {item.status === "pending" && !isProcessing && (
                          <Select
                            value={item.docType}
                            onValueChange={(v) => updateFileType(idx, v)}
                          >
                            <SelectTrigger className="h-5 w-[100px] border-0 bg-transparent px-1 text-[10px] text-text-secondary shadow-none">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DOCUMENT_TYPES.map((t) => (
                                <SelectItem key={t.value} value={t.value}>
                                  {t.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {item.status === "pending" && isProcessing && (
                          <span className="text-[10px] text-text-secondary">
                            Queued
                          </span>
                        )}
                        {item.status === "uploading" && (
                          <span className="text-[10px] font-medium text-brand-orange">
                            Uploading {item.progress}%
                          </span>
                        )}
                        {item.status === "processing" && (
                          <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Processing
                          </span>
                        )}
                        {item.status === "ready" && (
                          <span className="flex items-center gap-1 text-[10px] font-medium text-green-600">
                            <CheckCircle2 className="h-3 w-3" />
                            Uploaded & queued for indexing
                          </span>
                        )}
                        {item.status === "duplicate" && (
                          <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600">
                            <AlertTriangle className="h-3 w-3" />
                            Already exists — skipped
                          </span>
                        )}
                        {item.status === "error" && (
                          <span className="flex items-center gap-1 text-[10px] font-medium text-red-500">
                            <AlertCircle className="h-3 w-3" />
                            {item.error || "Failed"}
                          </span>
                        )}
                      </div>

                      {item.status === "uploading" && (
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-border-card">
                          <div
                            className="h-full rounded-full bg-brand-orange transition-all duration-300"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {item.status === "pending" && !isProcessing && (
                      <button
                        onClick={() => removeFile(idx)}
                        className="rounded-md p-1 text-text-secondary transition-colors hover:bg-border-card hover:text-text-primary"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {isProcessing && (
            <div className="rounded-lg border border-border-card bg-brand-off-white p-3 dark:bg-muted">
              <p className="text-[11px] text-text-secondary">
                Files are uploaded sequentially. Each file goes through: secure
                upload → text extraction → chunking → embedding generation →
                vector indexing.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            {allDone ? (
              <>
                <Button variant="outline" onClick={handleReset}>
                  Upload More
                </Button>
                <Button onClick={handleClose}>Done</Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={handleClose}
                  disabled={isProcessing}
                >
                  Cancel
                </Button>
                <Button
                  onClick={processQueue}
                  disabled={pendingCount === 0 || isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      Processing {queue.length - pendingCount} of{" "}
                      {queue.length}...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-1.5 h-4 w-4" />
                      Upload {pendingCount}{" "}
                      {pendingCount === 1 ? "File" : "Files"}
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
