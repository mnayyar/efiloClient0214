"use client";

import { useState, useCallback, useRef } from "react";

interface Source {
  index: number;
  documentId: string;
  documentName: string;
  documentType: string;
  pageNumber: number | null;
  sectionRef: string | null;
  chunkId: string;
}

interface Alert {
  type: "conflict" | "version_mismatch" | "superseded";
  message: string;
  sourceIndices: number[];
}

interface SuggestedPrompt {
  text: string;
  category: string;
}

export interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  confidence?: number;
  alerts?: Alert[];
  suggestedPrompts?: SuggestedPrompt[];
  scope?: "PROJECT" | "CROSS_PROJECT";
  timestamp?: string;
}

interface UseChatOptions {
  projectId: string;
  onSessionCreated?: (sessionId: string) => void;
}

export function useChat({ projectId, onSessionCreated }: UseChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentSources, setCurrentSources] = useState<Source[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (
      query: string,
      options?: { documentTypes?: string[]; scope?: "PROJECT" | "CROSS_PROJECT" }
    ) => {
      if (isLoading) return;

      setIsLoading(true);
      setStatus("Classifying query...");
      setCurrentSources([]);

      // Add user message optimistically
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
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            query,
            sessionId,
            projectId,
            documentTypes: options?.documentTypes,
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
                  // Could show scope info
                  break;

                case "sources":
                  setCurrentSources(data.data);
                  setStatus("Generating answer...");
                  break;

                case "answer": {
                  const assistantMsg: Message = {
                    role: "assistant",
                    content: data.data.response,
                    confidence: data.data.confidence,
                    alerts: data.data.alerts,
                  };
                  setMessages((prev) => [...prev, assistantMsg]);
                  break;
                }

                case "suggestions": {
                  // Attach suggested prompts to the last assistant message
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

                  // Attach sources to last assistant message
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant") {
                      return [
                        ...prev.slice(0, -1),
                        { ...last, sources: currentSources, id: data.data?.messageId },
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
              // Skip malformed events
              if (parseErr instanceof Error && parseErr.message !== "Unexpected end of JSON input") {
                throw parseErr;
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;

        const errorMessage = err instanceof Error ? err.message : "Unknown error";
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
    [isLoading, sessionId, projectId, currentSources, onSessionCreated]
  );

  const loadSession = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/chat/sessions/${id}`);
        if (!res.ok) return;
        const { data } = await res.json();
        setSessionId(data.id);
        setMessages((data.messages as Message[]) || []);
      } catch {
        // Ignore
      }
    },
    []
  );

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
