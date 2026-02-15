import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { ProjectDashboard } from "./project-dashboard";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      _count: {
        select: {
          documents: true,
          rfis: true,
        },
      },
    },
  });

  if (!project) {
    notFound();
  }

  const recentActivity = await prisma.auditLog.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      user: { select: { name: true } },
    },
  });

  const docStats = await prisma.document.groupBy({
    by: ["status"],
    where: { projectId },
    _count: true,
  });

  const readyDocs = docStats.find((s) => s.status === "READY")?._count ?? 0;

  return (
    <ProjectDashboard
      project={{
        id: project.id,
        name: project.name,
        code: project.projectCode,
        type: project.type,
        status: project.status,
        contractValue: project.contractValue
          ? Number(project.contractValue)
          : null,
        documentsCount: project._count.documents,
        readyDocuments: readyDocs,
        rfisCount: project._count.rfis,
      }}
      recentActivity={recentActivity.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        userName: a.user.name,
        createdAt: a.createdAt.toISOString(),
      }))}
    />
  );
}
