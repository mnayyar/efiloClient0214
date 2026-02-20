import { api } from "./client";

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
}

interface LoginResponse {
  data: { user: AuthUser };
}

interface UserResponse {
  data: AuthUser;
}

export async function devLogin(): Promise<AuthUser> {
  const res = await api.post<LoginResponse>("/api/auth/login", {
    email: "dev@efilo.ai",
    password: "dev",
  });
  return res.data.user;
}

export async function getMe(): Promise<AuthUser | null> {
  try {
    const res = await api.get<UserResponse>("/api/auth/user");
    return res.data;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await api.post("/api/auth/logout");
}

export async function ssoLogin(connectionId: string): Promise<string> {
  const res = await api.get<{ data: { url: string } }>(
    `/api/auth/sso?connectionId=${encodeURIComponent(connectionId)}`,
  );
  return res.data.url;
}
