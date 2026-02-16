"use client";

import {
  FileText,
  PenTool,
  FilePlus,
  MessageSquare,
  FileCheck,
  FileWarning,
  ClipboardCheck,
  Users,
  DollarSign,
  Calendar,
  Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_CONFIG: Record<
  string,
  { colors: string; icon: React.ElementType }
> = {
  SPEC: { colors: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800", icon: FileText },
  DRAWING: { colors: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800", icon: PenTool },
  ADDENDUM: { colors: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800", icon: FilePlus },
  RFI: { colors: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800", icon: MessageSquare },
  CONTRACT: { colors: "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800", icon: FileCheck },
  CHANGE: { colors: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800", icon: FileWarning },
  COMPLIANCE: { colors: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/50 dark:text-green-300 dark:border-green-800", icon: ClipboardCheck },
  MEETING: { colors: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-950/50 dark:text-slate-300 dark:border-slate-800", icon: Users },
  FINANCIAL: { colors: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800", icon: DollarSign },
  SCHEDULE: { colors: "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-300 dark:border-cyan-800", icon: Calendar },
  CLOSEOUT: { colors: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-950/50 dark:text-gray-300 dark:border-gray-800", icon: Archive },
};

interface SourceBadgeProps {
  index: number;
  documentName: string;
  documentType: string;
  pageNumber?: number | null;
  sectionRef?: string | null;
  onClick?: () => void;
}

export function SourceBadge({
  index,
  documentName,
  documentType,
  pageNumber,
  sectionRef,
  onClick,
}: SourceBadgeProps) {
  const config = TYPE_CONFIG[documentType] ?? {
    colors: "bg-gray-100 text-gray-800 border-gray-200",
    icon: FileText,
  };
  const Icon = config.icon;

  const label = [
    documentName,
    pageNumber ? `p. ${pageNumber}` : null,
    sectionRef ? `\u00A7${sectionRef}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-opacity hover:opacity-80",
        config.colors
      )}
      title={label}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="max-w-[200px] truncate">
        [{index}] {label}
      </span>
    </button>
  );
}
