"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2 } from "lucide-react";
import { SourceBadge } from "./source-badge";
import { AlertCard } from "./alert-card";
import { PromptPillRow } from "./prompt-pill";
import { cn } from "@/lib/utils";
import type { Message } from "@/hooks/use-chat";

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  status: string;
  onSelectPrompt: (text: string) => void;
  onSourceClick?: (documentId: string, pageNumber?: number | null) => void;
}

export function ChatMessages({
  messages,
  isLoading,
  status,
  onSelectPrompt,
  onSourceClick,
}: ChatMessagesProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<number>>(
    new Set()
  );

  // Auto-scroll on new messages
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-6">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "flex",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            {msg.role === "user" ? (
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-orange px-4 py-2.5 text-sm text-white">
                {msg.content}
              </div>
            ) : (
              <div className="max-w-[90%] space-y-3">
                {/* Answer */}
                <div className="rounded-2xl rounded-bl-sm border border-border-card bg-white px-4 py-3">
                  <div className="prose prose-sm max-w-none text-text-primary prose-headings:text-text-primary prose-strong:text-text-primary prose-a:text-brand-orange">
                    <Markdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </Markdown>
                  </div>

                  {/* Confidence */}
                  {msg.confidence !== undefined && msg.confidence > 0 && (
                    <div className="mt-2 border-t border-border-card pt-2">
                      <span className="text-xs text-text-secondary">
                        Confidence:{" "}
                        {(msg.confidence * 100).toFixed(0)}%
                      </span>
                      {msg.scope && (
                        <span className="ml-2 rounded-full bg-border-card px-2 py-0.5 text-xs text-text-secondary">
                          {msg.scope === "PROJECT"
                            ? "This Project"
                            : "All Projects"}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Alerts */}
                {msg.alerts && msg.alerts.length > 0 && (
                  <div className="space-y-2">
                    {msg.alerts
                      .filter((_, idx) => !dismissedAlerts.has(i * 100 + idx))
                      .map((alert, idx) => (
                        <AlertCard
                          key={idx}
                          alert={alert}
                          onDismiss={() =>
                            setDismissedAlerts(
                              (prev) => new Set([...prev, i * 100 + idx])
                            )
                          }
                        />
                      ))}
                  </div>
                )}

                {/* Sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {msg.sources.map((source) => (
                      <SourceBadge
                        key={source.chunkId}
                        index={source.index}
                        documentName={source.documentName}
                        documentType={source.documentType}
                        pageNumber={source.pageNumber}
                        sectionRef={source.sectionRef}
                        onClick={() =>
                          onSourceClick?.(
                            source.documentId,
                            source.pageNumber
                          )
                        }
                      />
                    ))}
                  </div>
                )}

                {/* Suggested prompts */}
                {msg.suggestedPrompts && msg.suggestedPrompts.length > 0 && (
                  <PromptPillRow
                    prompts={msg.suggestedPrompts}
                    onSelect={onSelectPrompt}
                  />
                )}
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && status && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-border-card bg-white px-4 py-3 text-sm text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin text-brand-orange" />
              {status}
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  );
}
