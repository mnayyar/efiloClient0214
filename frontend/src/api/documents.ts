import { api } from "./client";

export interface Document {
  id: string;
  name: string;
  type: string;
  status: string;
  mimeType: string;
  fileSize: number;
  pageCount: number | null;
  createdAt: string;
  updatedAt: string;
}

interface DocumentsResponse {
  data: Document[];
}

interface PresignResponse {
  data: { documentId: string; uploadUrl: string; r2Key: string };
}

interface DownloadResponse {
  data: { downloadUrl: string };
}

export async function getDocuments(projectId: string): Promise<Document[]> {
  const res = await api.get<DocumentsResponse>(
    `/api/projects/${projectId}/documents`
  );
  return res.data;
}

export async function requestUpload(
  projectId: string,
  body: {
    name: string;
    type: string;
    mimeType: string;
    fileSize: number;
    replace?: boolean;
  }
): Promise<PresignResponse["data"]> {
  const res = await api.post<PresignResponse>(
    `/api/projects/${projectId}/documents`,
    body
  );
  return res.data;
}

export async function confirmUpload(
  projectId: string,
  documentId: string
): Promise<void> {
  await api.post(`/api/projects/${projectId}/documents/${documentId}/confirm`);
}

export async function getDownloadUrl(
  projectId: string,
  documentId: string
): Promise<string> {
  const res = await api.get<DownloadResponse>(
    `/api/projects/${projectId}/documents/${documentId}/download`
  );
  return res.data.downloadUrl;
}

export async function deleteDocument(
  projectId: string,
  documentId: string
): Promise<void> {
  await api.delete(`/api/projects/${projectId}/documents/${documentId}`);
}

export async function bulkDeleteDocuments(
  projectId: string,
  documentIds: string[]
): Promise<{ deleted: number }> {
  const res = await api.post<{ data: { deleted: number } }>(
    `/api/projects/${projectId}/documents/bulk-delete`,
    { documentIds }
  );
  return res.data;
}

export async function reprocessDocuments(
  projectId: string
): Promise<{ requeued: number }> {
  const res = await api.post<{ data: { requeued: number } }>(
    `/api/projects/${projectId}/documents/reprocess`
  );
  return res.data;
}
