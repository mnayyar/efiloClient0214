import { useQuery } from "@tanstack/react-query";
import { Search, Loader2 } from "lucide-react";
import { getSearchSuggestions } from "@/api/chat";

interface EmptyStateProps {
  projectId: string;
  onSelectPrompt: (text: string) => void;
}

export function EmptyState({ projectId, onSelectPrompt }: EmptyStateProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["suggestions", projectId],
    queryFn: () => getSearchSuggestions(projectId),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-orange/10">
        <Search className="h-7 w-7 text-brand-orange" />
      </div>
      <h2 className="mt-4 text-xl font-semibold text-text-primary">
        Explore your project documents
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Ask questions about specs, drawings, contracts, and more
      </p>

      {isLoading ? (
        <div className="mt-8 flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading suggestions...
        </div>
      ) : data?.documentStats && data.documentStats.length === 0 ? (
        <p className="mt-8 text-sm text-text-secondary">
          No documents indexed yet &mdash; add them via Project Setup to start searching.
        </p>
      ) : (
        <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
          {(data?.suggestions ?? []).slice(0, 6).map((suggestion, i) => (
            <button
              key={i}
              onClick={() => onSelectPrompt(suggestion.text)}
              className="rounded-lg border border-border-card p-4 text-left transition-colors hover:border-brand-orange hover:bg-brand-orange/5"
            >
              <p className="text-sm font-medium text-text-primary">
                {suggestion.text}
              </p>
              <p className="mt-1 text-xs capitalize text-text-secondary">
                {suggestion.category}
              </p>
            </button>
          ))}
        </div>
      )}

      {data?.documentStats && data.documentStats.length > 0 && (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {data.documentStats.map((stat) => (
            <span
              key={stat.type}
              className="rounded-full bg-border-card px-2.5 py-0.5 text-xs text-text-secondary"
            >
              {stat.type}: {stat.count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
