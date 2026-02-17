import { ComplianceClient } from "./compliance-client";

export default async function CompliancePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ComplianceClient projectId={projectId} />;
}
