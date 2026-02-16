import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { ProjectContextBar } from "./project-context-bar";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, projectCode: true, type: true },
  });

  if (!project) {
    notFound();
  }

  return (
    <div className="flex h-full flex-col">
      <ProjectContextBar
        projectId={project.id}
        name={project.name}
        code={project.projectCode}
        type={project.type}
      />
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
