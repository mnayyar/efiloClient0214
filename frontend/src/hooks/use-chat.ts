import { useState, useCallback, useRef } from "react";
import type {
  ChatMessage,
  Source,
  Alert,
  SuggestedPrompt,
  WebCitation,
} from "@/api/chat";

export type { ChatMessage, Source, Alert, SuggestedPrompt, WebCitation };

export type Message = ChatMessage;

interface UseChatOptions {
  projectId: string;
  onSessionCreated?: (sessionId: string) => void;
}

export function useChat({ projectId, onSessionCreated }: UseChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sourcesRef = useRef<Source[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (
      query: string,
      options?: {
        documentTypes?: string[];
        scope?: "PROJECT" | "CROSS_PROJECT" | "WORLD";
      }
    ) => {
      if (isLoading) return;

      setIsLoading(true);
      setStatus("Classifying query...");
      sourcesRef.current = [];

      const userMsg: Message = {
        role: "user",
        content: query,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      try {
        abortRef.current = new AbortController();

        const response = await fetch("/api/chat", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            query,
            sessionId,
            projectId,
            documentTypes: options?.documentTypes,
            scope: options?.scope,
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;

            try {
              const data = JSON.parse(trimmed.slice(6));

              switch (data.type) {
                case "status":
                  setStatus(data.message);
                  break;

                case "classification":
                  break;

                case "sources":
                  sourcesRef.current = data.data;
                  setStatus("Generating answer...");
                  break;

                case "answer": {
                  const assistantMsg: Message = {
                    role: "assistant",
                    content: data.data.response,
                    confidence: data.data.confidence,
                    alerts: data.data.alerts,
                    webCitations: data.data.webCitations,
                  };
                  setMessages((prev) => [...prev, assistantMsg]);
                  break;
                }

                case "suggestions": {
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant") {
                      return [
                        ...prev.slice(0, -1),
                        { ...last, suggestedPrompts: data.data },
                      ];
                    }
                    return prev;
                  });
                  break;
                }

                case "done": {
                  const newSessionId = data.data?.sessionId;
                  if (newSessionId && !sessionId) {
                    setSessionId(newSessionId);
                    onSessionCreated?.(newSessionId);
                  }

                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant") {
                      const cited = new Set<number>();
                      const citationPattern =
                        /\[Source\s+(\d+)(?:\s*,\s*Source\s+(\d+))*\]/gi;
                      let match;
                      while (
                        (match = citationPattern.exec(last.content)) !== null
                      ) {
                        const nums = match[0].match(/\d+/g);
                        nums?.forEach((n) => cited.add(parseInt(n, 10)));
                      }
                      const citedSources =
                        cited.size > 0
                          ? sourcesRef.current.filter((s) =>
                              cited.has(s.index)
                            )
                          : sourcesRef.current;
                      const seen = new Set<string>();
                      const dedupedSources = citedSources.filter((s) => {
                        if (seen.has(s.documentId)) return false;
                        seen.add(s.documentId);
                        return true;
                      });
                      return [
                        ...prev.slice(0, -1),
                        {
                          ...last,
                          sources: dedupedSources,
                          id: data.data?.messageId,
                        },
                      ];
                    }
                    return prev;
                  });

                  setIsLoading(false);
                  setStatus("");
                  break;
                }

                case "error":
                  throw new Error(data.message);
              }
            } catch (parseErr) {
              if (
                parseErr instanceof Error &&
                parseErr.message !== "Unexpected end of JSON input"
              ) {
                throw parseErr;
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;

        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        console.error("Chat error:", errorMessage);

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Sorry, an error occurred: ${errorMessage}`,
            timestamp: new Date().toISOString(),
          },
        ]);
        setIsLoading(false);
        setStatus("");
      }
    },
    [isLoading, sessionId, projectId, onSessionCreated]
  );

  const loadSession = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/chat/sessions/${id}`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const { data } = await res.json();
      setSessionId(data.id);
      setMessages((data.messages as Message[]) || []);
    } catch {
      // Ignore
    }
  }, []);

  const startNewSession = useCallback(() => {
    setSessionId(null);
    setMessages([]);
    setStatus("");
    setIsLoading(false);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    setStatus("");
  }, []);

  return {
    messages,
    isLoading,
    status,
    sessionId,
    sendMessage,
    loadSession,
    startNewSession,
    cancel,
  };
}
