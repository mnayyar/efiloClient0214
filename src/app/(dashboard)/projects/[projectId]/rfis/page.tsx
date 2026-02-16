import { RfiPageClient } from "./rfi-client";

export default async function RFIsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <RfiPageClient projectId={projectId} />;
}
