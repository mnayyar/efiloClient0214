"use client";

import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExternalLink, Loader2 } from "lucide-react";
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

/* ── Custom markdown component overrides for polished rendering ─────────── */

const mdComponents = {
  h1: ({ children, ...props }: ComponentPropsWithoutRef<"h1">) => (
    <h1
      className="mb-3 mt-5 text-lg font-bold tracking-tight text-text-primary first:mt-0"
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: ComponentPropsWithoutRef<"h2">) => (
    <h2
      className="mb-2 mt-5 text-[15px] font-semibold tracking-tight text-text-primary first:mt-0"
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: ComponentPropsWithoutRef<"h3">) => (
    <h3
      className="mb-1.5 mt-4 text-sm font-semibold text-text-primary first:mt-0"
      {...props}
    >
      {children}
    </h3>
  ),
  p: ({ children, ...props }: ComponentPropsWithoutRef<"p">) => (
    <p className="mb-2.5 text-sm leading-relaxed text-text-primary last:mb-0" {...props}>
      {children}
    </p>
  ),
  strong: ({ children, ...props }: ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-semibold text-text-primary" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }: ComponentPropsWithoutRef<"em">) => (
    <em className="text-text-secondary" {...props}>
      {children}
    </em>
  ),
  ul: ({ children, ...props }: ComponentPropsWithoutRef<"ul">) => (
    <ul className="mb-3 ml-1 space-y-1 text-sm" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }: ComponentPropsWithoutRef<"ol">) => (
    <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm marker:font-semibold marker:text-brand-orange/70" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, node, ...props }: ComponentPropsWithoutRef<"li"> & { node?: { position?: unknown; parentNode?: { tagName?: string } } }) => {
    const isOrdered = node?.parentNode?.tagName === "ol";
    return isOrdered ? (
      <li className="pl-1 leading-relaxed text-text-primary" {...props}>
        {children}
      </li>
    ) : (
      <li className="flex gap-2 leading-relaxed text-text-primary" {...props}>
        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-orange/60" />
        <span className="flex-1">{children}</span>
      </li>
    );
  },
  table: ({ children, ...props }: ComponentPropsWithoutRef<"table">) => (
    <div className="mb-3 overflow-x-auto rounded-lg border border-border-card">
      <table className="w-full text-sm" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }: ComponentPropsWithoutRef<"thead">) => (
    <thead className="border-b border-border-card bg-brand-off-white dark:bg-muted" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }: ComponentPropsWithoutRef<"th">) => (
    <th
      className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }: ComponentPropsWithoutRef<"td">) => (
    <td
      className="border-t border-border-card px-3 py-2 text-sm text-text-primary"
      {...props}
    >
      {children}
    </td>
  ),
  tr: ({ children, ...props }: ComponentPropsWithoutRef<"tr">) => (
    <tr className="transition-colors hover:bg-brand-off-white/50 dark:hover:bg-muted/30" {...props}>
      {children}
    </tr>
  ),
  blockquote: ({ children, ...props }: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      className="mb-3 border-l-3 border-brand-orange/40 pl-3 text-sm italic text-text-secondary"
      {...props}
    >
      {children}
    </blockquote>
  ),
  code: ({ children, className, ...props }: ComponentPropsWithoutRef<"code">) => {
    const isInline = !className;
    return isInline ? (
      <code
        className="rounded bg-brand-off-white px-1.5 py-0.5 font-mono text-xs text-brand-orange dark:bg-muted"
        {...props}
      >
        {children}
      </code>
    ) : (
      <code className={cn("font-mono text-xs", className)} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }: ComponentPropsWithoutRef<"pre">) => (
    <pre
      className="mb-3 overflow-x-auto rounded-lg border border-border-card bg-brand-off-white p-3 font-mono text-xs dark:bg-muted"
      {...props}
    >
      {children}
    </pre>
  ),
  hr: (props: ComponentPropsWithoutRef<"hr">) => (
    <hr className="my-4 border-border-card" {...props} />
  ),
  a: ({ children, ...props }: ComponentPropsWithoutRef<"a">) => (
    <a className="font-medium text-brand-orange underline underline-offset-2 hover:text-brand-orange/80" {...props}>
      {children}
    </a>
  ),
};

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
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-orange px-4 py-2.5 text-sm text-white shadow-sm">
                {msg.content}
              </div>
            ) : (
              <div className="max-w-[92%] space-y-3">
                {/* Answer card */}
                <div className="rounded-2xl rounded-bl-sm border border-border-card bg-card px-5 py-4 shadow-sm">
                  <Markdown
                    remarkPlugins={[remarkGfm]}
                    components={mdComponents}
                  >
                    {msg.content}
                  </Markdown>

                  {/* Confidence footer */}
                  {msg.confidence !== undefined && msg.confidence > 0 && (
                    <div className="mt-3 flex items-center gap-3 border-t border-border-card pt-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-border-card">
                          <div
                            className="h-full rounded-full bg-brand-orange transition-all"
                            style={{ width: `${Math.min(msg.confidence * 100, 100)}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-medium text-text-secondary">
                          {(msg.confidence * 100).toFixed(0)}% confident
                        </span>
                      </div>
                      {msg.scope && (
                        <span className="rounded-full border border-border-card px-2 py-0.5 text-[11px] text-text-secondary">
                          {msg.scope === "PROJECT"
                            ? "This Project"
                            : msg.scope === "CROSS_PROJECT"
                              ? "All Projects"
                              : "Web Search"}
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

                {/* Document sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                      Sources
                    </p>
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
                  </div>
                )}

                {/* Web citations */}
                {msg.webCitations && msg.webCitations.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                      Web Sources
                    </p>
                    <div className="flex flex-col gap-1">
                      {msg.webCitations.map((cite, idx) => (
                        <a
                          key={idx}
                          href={cite.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-lg border border-border-card bg-brand-off-white px-3 py-1.5 text-xs text-text-primary transition-colors hover:border-brand-orange hover:text-brand-orange"
                        >
                          <ExternalLink className="h-3 w-3 shrink-0 text-text-secondary" />
                          <span className="truncate">{cite.title}</span>
                        </a>
                      ))}
                    </div>
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
            <div className="flex items-center gap-2.5 rounded-2xl rounded-bl-sm border border-border-card bg-card px-5 py-3 text-sm text-text-secondary shadow-sm">
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
