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
  SPEC: { colors: "bg-blue-100 text-blue-800 border-blue-200", icon: FileText },
  DRAWING: { colors: "bg-purple-100 text-purple-800 border-purple-200", icon: PenTool },
  ADDENDUM: { colors: "bg-orange-100 text-orange-800 border-orange-200", icon: FilePlus },
  RFI: { colors: "bg-amber-100 text-amber-800 border-amber-200", icon: MessageSquare },
  CONTRACT: { colors: "bg-indigo-100 text-indigo-800 border-indigo-200", icon: FileCheck },
  CHANGE: { colors: "bg-red-100 text-red-800 border-red-200", icon: FileWarning },
  COMPLIANCE: { colors: "bg-green-100 text-green-800 border-green-200", icon: ClipboardCheck },
  MEETING: { colors: "bg-slate-100 text-slate-800 border-slate-200", icon: Users },
  FINANCIAL: { colors: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: DollarSign },
  SCHEDULE: { colors: "bg-cyan-100 text-cyan-800 border-cyan-200", icon: Calendar },
  CLOSEOUT: { colors: "bg-gray-100 text-gray-800 border-gray-200", icon: Archive },
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
