import { api } from "./client";

export interface OrgData {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  primaryColor: string;
  billingEmail: string;
  street: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string;
  replyToDomain: string | null;
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  authMethod: string;
  avatar: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export async function getOrganization(): Promise<OrgData> {
  const res = await api.get<{ data: OrgData }>("/api/settings/organization");
  return res.data;
}

export async function updateOrganization(
  body: Partial<OrgData>
): Promise<OrgData> {
  const res = await api.patch<{ data: OrgData }>(
    "/api/settings/organization",
    body
  );
  return res.data;
}

export async function uploadLogo(file: File): Promise<{ logo: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.upload<{ data: { logo: string } }>(
    "/api/settings/organization/logo",
    formData
  );
  return res.data;
}

export async function deleteLogo(): Promise<void> {
  await api.delete("/api/settings/organization/logo");
}

export async function getUsers(): Promise<UserRecord[]> {
  const res = await api.get<{ data: UserRecord[] }>("/api/settings/users");
  return res.data;
}

export async function createUser(
  body: Record<string, unknown>
): Promise<UserRecord> {
  const res = await api.post<{ data: UserRecord }>(
    "/api/settings/users",
    body
  );
  return res.data;
}

export async function updateUser(
  userId: string,
  body: Record<string, unknown>
): Promise<UserRecord> {
  const res = await api.patch<{ data: UserRecord }>(
    `/api/settings/users/${userId}`,
    body
  );
  return res.data;
}

export async function deleteUser(userId: string): Promise<void> {
  await api.delete(`/api/settings/users/${userId}`);
}
