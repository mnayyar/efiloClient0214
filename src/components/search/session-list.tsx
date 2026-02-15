"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, MessageSquare, Archive, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Session {
  id: string;
  title: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  project?: { id: string; name: string } | null;
}

interface SessionListProps {
  projectId?: string;
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
}

export function SessionList({
  projectId,
  activeSessionId,
  onSelectSession,
  onNewChat,
}: SessionListProps) {
  const queryClient = useQueryClient();

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["chat-sessions", projectId],
    queryFn: async () => {
      const params = projectId ? `?projectId=${projectId}` : "";
      const res = await fetch(`/api/chat/sessions${params}`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.data as Session[];
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      await fetch(`/api/chat/sessions/${sessionId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
    },
  });

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="flex h-full flex-col border-r border-border-card bg-brand-off-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-card px-4 py-3">
        <h3 className="text-sm font-semibold text-text-primary">History</h3>
        <button
          onClick={onNewChat}
          className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-border-card hover:text-text-primary"
          title="New conversation"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Sessions */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-text-secondary" />
          </div>
        ) : !sessions || sessions.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-text-secondary">
            No conversations yet
          </p>
        ) : (
          <div className="space-y-0.5 p-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  "group flex items-start gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  activeSessionId === session.id
                    ? "bg-brand-orange/10 text-brand-orange"
                    : "text-text-secondary hover:bg-border-card hover:text-text-primary"
                )}
              >
                <button
                  onClick={() => onSelectSession(session.id)}
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                >
                  <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {session.title ?? "Untitled"}
                    </p>
                    <p className="text-[10px] opacity-70">
                      {formatDate(session.updatedAt)}
                    </p>
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    archiveMutation.mutate(session.id);
                  }}
                  className="mt-0.5 hidden rounded p-0.5 opacity-0 transition-opacity group-hover:block group-hover:opacity-70 hover:!opacity-100"
                  title="Archive"
                >
                  <Archive className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
