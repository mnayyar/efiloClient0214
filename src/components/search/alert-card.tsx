"use client";

import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Alert {
  type: "conflict" | "version_mismatch" | "superseded";
  message: string;
  sourceIndices: number[];
}

interface AlertCardProps {
  alert: Alert;
  onDismiss?: () => void;
}

const ALERT_CONFIG = {
  conflict: {
    icon: AlertTriangle,
    title: "CONFLICT DETECTED",
    borderColor: "border-red-300 dark:border-red-800",
    bgColor: "bg-red-50 dark:bg-red-950/50",
    iconColor: "text-red-500 dark:text-red-400",
    titleColor: "text-red-800 dark:text-red-300",
  },
  version_mismatch: {
    icon: RefreshCw,
    title: "DOCUMENT UPDATED",
    borderColor: "border-amber-300 dark:border-amber-800",
    bgColor: "bg-amber-50 dark:bg-amber-950/50",
    iconColor: "text-amber-500 dark:text-amber-400",
    titleColor: "text-amber-800 dark:text-amber-300",
  },
  superseded: {
    icon: AlertTriangle,
    title: "ADDENDUM SUPERSESSION",
    borderColor: "border-amber-300 dark:border-amber-800",
    bgColor: "bg-amber-50 dark:bg-amber-950/50",
    iconColor: "text-amber-500 dark:text-amber-400",
    titleColor: "text-amber-800 dark:text-amber-300",
  },
};

export function AlertCard({ alert, onDismiss }: AlertCardProps) {
  const config = ALERT_CONFIG[alert.type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        config.borderColor,
        config.bgColor
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", config.iconColor)} />
        <div className="min-w-0 flex-1">
          <p className={cn("text-xs font-semibold", config.titleColor)}>
            {config.title}
          </p>
          <p className="mt-0.5 text-xs text-text-primary">{alert.message}</p>
          {alert.sourceIndices.length > 0 && (
            <p className="mt-1 text-xs text-text-secondary">
              Sources: {alert.sourceIndices.join(", ")}
            </p>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="rounded p-0.5 text-text-secondary hover:text-text-primary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
