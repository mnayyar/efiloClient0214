import { SearchPageClient } from "./search-client";

export default async function SearchPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <div className="h-full">
      <SearchPageClient projectId={projectId} />
    </div>
  );
}
