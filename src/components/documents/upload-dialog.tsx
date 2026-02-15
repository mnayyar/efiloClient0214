"use client";

import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, X, FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ACCEPTED_TYPES = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};

type UploadStatus = "idle" | "uploading" | "confirming" | "processing" | "ready" | "error";

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
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<string>("SPEC");
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length > 0) {
      setFile(accepted[0]);
      setError(null);
      setStatus("idle");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_FILE_SIZE,
    maxFiles: 1,
    onDropRejected: (rejections) => {
      const err = rejections[0]?.errors[0];
      if (err?.code === "file-too-large") {
        setError("File exceeds 100MB limit");
      } else if (err?.code === "file-invalid-type") {
        setError("Unsupported file type. Use PDF, DOCX, XLSX, PNG, or JPEG.");
      } else {
        setError(err?.message ?? "File rejected");
      }
    },
  });

  // Poll for document status after confirming
  useEffect(() => {
    if (status !== "processing" || !docId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/documents/${docId}`
        );
        const data = await res.json();
        if (data.data?.status === "READY") {
          setStatus("ready");
          clearInterval(interval);
          onUploadComplete?.();
        } else if (data.data?.status === "ERROR") {
          setStatus("error");
          setError("Document processing failed");
          clearInterval(interval);
        }
      } catch {
        // Ignore polling errors
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [status, docId, projectId, onUploadComplete]);

  async function handleUpload() {
    if (!file) return;

    try {
      setStatus("uploading");
      setProgress(0);

      // 1. Get presigned upload URL
      const presignRes = await fetch(
        `/api/projects/${projectId}/documents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            type: docType,
            mimeType: file.type,
            size: file.size,
          }),
        }
      );

      if (!presignRes.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { data } = await presignRes.json();
      setDocId(data.documentId);

      // 2. Upload file directly to R2
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      await new Promise<void>((resolve, reject) => {
        xhr.open("PUT", data.uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(file);
      });

      // 3. Confirm upload
      setStatus("confirming");
      const confirmRes = await fetch(
        `/api/projects/${projectId}/documents/${data.documentId}/confirm`,
        { method: "POST" }
      );

      if (!confirmRes.ok) {
        throw new Error("Failed to confirm upload");
      }

      setStatus("processing");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  function handleReset() {
    setFile(null);
    setDocType("SPEC");
    setStatus("idle");
    setProgress(0);
    setError(null);
    setDocId(null);
  }

  function handleClose() {
    if (status === "uploading" || status === "confirming") return;
    handleReset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>

        {status === "ready" ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle2 className="h-12 w-12 text-status-success" />
            <p className="font-medium text-text-primary">
              Document processed successfully
            </p>
            <p className="text-sm text-text-secondary">
              {file?.name} is ready for search
            </p>
            <Button onClick={handleClose} className="mt-2">
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Dropzone */}
            {!file ? (
              <div
                {...getRootProps()}
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors ${
                  isDragActive
                    ? "border-brand-orange bg-brand-orange/5"
                    : "border-border-card hover:border-brand-orange/50"
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="h-8 w-8 text-text-secondary" />
                <p className="text-sm font-medium text-text-primary">
                  Drop file here or click to browse
                </p>
                <p className="text-xs text-text-secondary">
                  PDF, DOCX, XLSX, PNG, JPEG — up to 100MB
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-border-card p-3">
                <FileText className="h-8 w-8 shrink-0 text-text-secondary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {file.name}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
                {status === "idle" && (
                  <button
                    onClick={() => setFile(null)}
                    className="rounded p-1 text-text-secondary hover:text-text-primary"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}

            {/* Document type selector */}
            {file && status === "idle" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-text-primary">
                  Document Type
                </label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full rounded-md border border-border-card bg-white px-3 py-2 text-sm text-text-primary focus:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange"
                >
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Progress bar */}
            {(status === "uploading" || status === "confirming" || status === "processing") && (
              <div>
                <div className="mb-1 flex justify-between text-xs text-text-secondary">
                  <span>
                    {status === "uploading"
                      ? "Uploading..."
                      : status === "confirming"
                        ? "Confirming..."
                        : "Processing document..."}
                  </span>
                  {status === "uploading" && <span>{progress}%</span>}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-border-card">
                  {status === "uploading" ? (
                    <div
                      className="h-full rounded-full bg-brand-orange transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  ) : (
                    <div className="h-full w-full animate-pulse rounded-full bg-brand-orange/60" />
                  )}
                </div>
                {status === "processing" && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-text-secondary">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Extracting text and generating embeddings...
                  </p>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Actions */}
            {status === "idle" && file && (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleReset}>
                  Cancel
                </Button>
                <Button onClick={handleUpload}>Upload</Button>
              </div>
            )}

            {status === "error" && (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleReset}>
                  Try Again
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
