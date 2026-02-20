import { useState, useCallback } from "react";
import { useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import { ChatMessages } from "@/components/search/chat-messages";
import { ChatInput } from "@/components/search/chat-input";
import { SessionList } from "@/components/search/session-list";
import { EmptyState } from "@/components/search/empty-state";

export function SearchPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [promptValue, setPromptValue] = useState<string | undefined>();

  const {
    messages,
    isLoading,
    status,
    sessionId,
    sendMessage,
    loadSession,
    startNewSession,
  } = useChat({
    projectId: projectId!,
    onSessionCreated: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
    },
  });

  const handleSelectPrompt = useCallback((text: string) => {
    setPromptValue(text);
  }, []);

  const handleSend = useCallback(
    (
      query: string,
      options?: { scope?: "PROJECT" | "CROSS_PROJECT" | "WORLD" }
    ) => {
      setPromptValue(undefined);
      sendMessage(query, options);
    },
    [sendMessage]
  );

  if (!projectId) return null;

  return (
    <div className="flex h-full">
      {/* Session sidebar */}
      {sidebarOpen && (
        <div className="hidden w-64 shrink-0 lg:block">
          <SessionList
            projectId={projectId}
            activeSessionId={sessionId}
            onSelectSession={loadSession}
            onNewChat={startNewSession}
          />
        </div>
      )}

      {/* Main chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-border-card px-4 py-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden rounded-md p-1.5 text-text-secondary transition-colors hover:bg-border-card hover:text-text-primary lg:block"
            title={sidebarOpen ? "Hide history" : "Show history"}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </button>
          <h1 className="text-sm font-semibold text-text-primary">
            Ask about your Project
          </h1>
          {sessionId && (
            <span className="text-xs text-text-secondary">
              &middot; Active session
            </span>
          )}
        </div>

        {/* Messages or empty state */}
        {messages.length === 0 && !isLoading ? (
          <EmptyState
            projectId={projectId}
            onSelectPrompt={handleSelectPrompt}
          />
        ) : (
          <ChatMessages
            messages={messages}
            isLoading={isLoading}
            status={status}
            onSelectPrompt={handleSelectPrompt}
          />
        )}

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          isLoading={isLoading}
          initialValue={promptValue}
        />
      </div>
    </div>
  );
}
