"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChat } from "@/hooks/use-chat";
import { ChatMessages } from "@/components/search/chat-messages";
import { ChatInput } from "@/components/search/chat-input";
import { EmptyState } from "@/components/search/empty-state";
import { SessionList } from "@/components/search/session-list";
import { PanelLeftClose, PanelLeft } from "lucide-react";

interface SearchPageClientProps {
  projectId: string;
}

export function SearchPageClient({ projectId }: SearchPageClientProps) {
  const [showSessions, setShowSessions] = useState(true);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const {
    messages,
    isLoading,
    status,
    sessionId,
    sendMessage,
    loadSession,
    startNewSession,
  } = useChat({
    projectId,
    onSessionCreated: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
    },
  });

  const handleSelectPrompt = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage]
  );

  const handleSend = useCallback(
    (query: string, options?: { scope?: "PROJECT" | "CROSS_PROJECT" | "WORLD" }) => {
      setPendingPrompt(null);
      sendMessage(query, options);
    },
    [sendMessage]
  );

  const handleSourceClick = useCallback(
    async (documentId: string) => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/documents/${documentId}/download`
        );
        if (!res.ok) return;
        const { data } = await res.json();

        // PDFs and images open in-browser; everything else downloads
        const viewableTypes = ["application/pdf", "image/png", "image/jpeg"];
        if (viewableTypes.includes(data.mimeType)) {
          window.open(data.downloadUrl, "_blank");
        } else {
          const link = document.createElement("a");
          link.href = data.downloadUrl;
          link.download = data.name;
          link.click();
        }
      } catch {
        // silently fail
      }
    },
    [projectId]
  );

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Session sidebar */}
      <div
        className={`hidden transition-all duration-200 md:block ${
          showSessions ? "w-[260px]" : "w-0"
        } overflow-hidden`}
      >
        <SessionList
          projectId={projectId}
          activeSessionId={sessionId}
          onSelectSession={loadSession}
          onNewChat={startNewSession}
        />
      </div>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col">
        {/* Toggle sessions */}
        <div className="flex items-center justify-between border-b border-border-card px-4 py-2">
          <button
            onClick={() => setShowSessions(!showSessions)}
            className="hidden rounded-md p-1.5 text-text-secondary transition-colors hover:text-text-primary md:block"
            title={showSessions ? "Hide sessions" : "Show sessions"}
          >
            {showSessions ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </button>
          <h2 className="text-sm font-medium text-text-primary">
            {sessionId ? "Conversation" : "New Conversation"}
          </h2>
          <div />
        </div>

        {/* Messages or empty state */}
        {hasMessages ? (
          <ChatMessages
            messages={messages}
            isLoading={isLoading}
            status={status}
            onSelectPrompt={handleSelectPrompt}
            onSourceClick={handleSourceClick}
          />
        ) : (
          <EmptyState
            projectId={projectId}
            onSelectPrompt={handleSelectPrompt}
          />
        )}

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          isLoading={isLoading}
          initialValue={pendingPrompt ?? undefined}
        />
      </div>
    </div>
  );
}
