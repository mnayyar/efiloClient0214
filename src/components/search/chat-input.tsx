"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (
    query: string,
    options?: { scope?: "PROJECT" | "CROSS_PROJECT" }
  ) => void;
  isLoading: boolean;
  initialValue?: string;
}

export function ChatInput({ onSend, isLoading, initialValue }: ChatInputProps) {
  const [value, setValue] = useState(initialValue ?? "");
  const [scope, setScope] = useState<"PROJECT" | "CROSS_PROJECT">("PROJECT");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);

  // Set initial value when provided
  useEffect(() => {
    if (initialValue) {
      setValue(initialValue);
      textareaRef.current?.focus();
    }
  }, [initialValue]);

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed, { scope });
    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="border-t border-border-card bg-card px-4 py-3">
      <div className="mx-auto max-w-3xl">
        {/* Scope toggle */}
        <div className="mb-2 flex items-center gap-1">
          <button
            onClick={() => setScope("PROJECT")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              scope === "PROJECT"
                ? "bg-brand-orange text-white"
                : "bg-border-card text-text-secondary hover:text-text-primary"
            )}
          >
            This Project
          </button>
          <button
            onClick={() => setScope("CROSS_PROJECT")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              scope === "CROSS_PROJECT"
                ? "bg-brand-orange text-white"
                : "bg-border-card text-text-secondary hover:text-text-primary"
            )}
          >
            All Projects
          </button>
        </div>

        {/* Input */}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your project documents..."
            disabled={isLoading}
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border-card bg-brand-off-white px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange disabled:opacity-50"
          />
          <button
            onClick={handleSubmit}
            disabled={!value.trim() || isLoading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-orange text-white transition-colors hover:bg-brand-orange/90 disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="mt-1 text-center text-[10px] text-text-secondary">
          Shift + Enter for new line
        </p>
      </div>
    </div>
  );
}
