"use client";

import {
  Search,
  DollarSign,
  AlertTriangle,
  BarChart3,
  FileText,
  CheckSquare,
} from "lucide-react";

interface SuggestedPrompt {
  text: string;
  category: string;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  factual: FileText,
  analysis: BarChart3,
  action: CheckSquare,
  comparison: Search,
  financial: DollarSign,
  compliance: AlertTriangle,
  specs: FileText,
  rfis: Search,
  schedule: BarChart3,
  general: Search,
};

interface PromptPillProps {
  prompt: SuggestedPrompt;
  onClick: (text: string) => void;
}

export function PromptPill({ prompt, onClick }: PromptPillProps) {
  const Icon = CATEGORY_ICONS[prompt.category] ?? Search;

  return (
    <button
      onClick={() => onClick(prompt.text)}
      className="inline-flex items-center gap-1.5 rounded-full border border-border-card bg-card px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-brand-orange hover:text-brand-orange"
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="max-w-[250px] truncate">{prompt.text}</span>
    </button>
  );
}

export function PromptPillRow({
  prompts,
  onSelect,
}: {
  prompts: SuggestedPrompt[];
  onSelect: (text: string) => void;
}) {
  if (prompts.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {prompts.map((prompt, i) => (
        <PromptPill key={i} prompt={prompt} onClick={onSelect} />
      ))}
    </div>
  );
}
