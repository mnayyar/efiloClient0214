import { api } from "./client";

export interface Project {
  id: string;
  name: string;
  projectCode: string;
  type: string;
  status: string;
  gcName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  createdAt: string;
}

interface ProjectsResponse {
  data: Project[];
}

interface ProjectResponse {
  data: Project;
}

export async function getProjects(): Promise<Project[]> {
  const res = await api.get<ProjectsResponse>("/api/projects");
  return res.data;
}

export async function getProject(id: string): Promise<Project> {
  const res = await api.get<ProjectResponse>(`/api/projects/${id}`);
  return res.data;
}
