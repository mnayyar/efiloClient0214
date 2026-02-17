"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  Send,
  RefreshCw,
  Filter,
  ChevronRight,
  Activity,
  TrendingUp,
  DollarSign,
  Flame,
  Plus,
  Eye,
  X,
  Loader2,
  Bell,
  Zap,
  CircleOff,
  Pencil,
  Trash2,
  Building2,
  Mail,
  User,
  MapPin,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────

interface ComplianceScore {
  projectId: string;
  score: number;
  compliancePercentage: number | null;
  onTimeCount: number;
  totalCount: number;
  missedCount: number;
  currentStreak: number;
  bestStreak: number;
  streakBrokenAt: string | null;
  protectedClaimsValue: number;
  atRiskValue: number;
  atRiskCount: number;
  activeCount: number;
  upcomingCount: number;
  display: {
    scorePercentage: string;
    streakDisplay: string;
    protectedValue: string;
    verdict: string;
  };
}

interface Deadline {
  id: string;
  projectId: string;
  clauseId: string;
  triggerEventType: string;
  triggerDescription: string;
  triggeredAt: string;
  calculatedDeadline: string;
  status: string;
  severity: string;
  noticeId: string | null;
  noticeCreatedAt: string | null;
  waivedAt: string | null;
  waiverReason: string | null;
  createdAt: string;
  // Flat fields from DeadlineWithCountdown
  sectionRef: string | null;
  clauseTitle: string;
  clauseKind: string;
  daysRemaining: number;
  hoursRemaining: number;
}

interface Notice {
  id: string;
  projectId: string;
  type: string;
  title: string;
  content: string;
  status: string;
  recipientName: string | null;
  recipientEmail: string | null;
  dueDate: string | null;
  clauseId: string | null;
  deliveryMethods: string[];
  sentAt: string | null;
  deliveredAt: string | null;
  onTimeStatus: boolean | null;
  generatedByAI: boolean;
  aiModel: string | null;
  createdAt: string;
}

interface Clause {
  id: string;
  kind: string;
  title: string;
  sectionRef: string | null;
  deadlineDays: number | null;
  deadlineType: string | null;
  noticeMethod: string | null;
  trigger: string | null;
  requiresReview: boolean;
  reviewReason: string | null;
  confirmed: boolean;
  aiExtracted: boolean;
  createdAt: string;
}

interface ScoreHistory {
  date: string;
  compliancePercentage: number | null;
  onTimeCount: number;
  totalCount: number;
  protectedClaimsValue: number;
}

interface ComplianceClientProps {
  projectId: string;
}

// ── Constants ─────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  EXPIRED:
    "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800",
  CRITICAL:
    "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800",
  WARNING:
    "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
  INFO: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800",
  LOW: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:
    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300",
  NOTICE_DRAFTED:
    "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300",
  NOTICE_SENT:
    "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300",
  COMPLETED:
    "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300",
  EXPIRED:
    "bg-red-100 text-red-600 border-red-200 dark:bg-red-950/50 dark:text-red-300",
  WAIVED:
    "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400",
};

const NOTICE_STATUS_COLORS: Record<string, string> = {
  DRAFT:
    "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300",
  PENDING_REVIEW:
    "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300",
  SENT: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300",
  ACKNOWLEDGED:
    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300",
  EXPIRED:
    "bg-red-100 text-red-600 border-red-200 dark:bg-red-950/50 dark:text-red-300",
  FAILED:
    "bg-red-100 text-red-600 border-red-200 dark:bg-red-950/50 dark:text-red-300",
  VOID: "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatKind(kind: string) {
  return kind.replace(/_/g, " ");
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

// ── Tab Type ──────────────────────────────────────────────────────────────

type Tab = "deadlines" | "clauses" | "notices";

// ── Main Component ────────────────────────────────────────────────────────

export function ComplianceClient({ projectId }: ComplianceClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>("deadlines");
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [showDashboard, setShowDashboard] = useState(true);
  const [detailDeadline, setDetailDeadline] = useState<Deadline | null>(null);
  const [waiveDialogOpen, setWaiveDialogOpen] = useState(false);
  const [waiveDeadlineId, setWaiveDeadlineId] = useState<string | null>(null);
  const [waiveReason, setWaiveReason] = useState("");
  const [createNoticeDeadline, setCreateNoticeDeadline] =
    useState<Deadline | null>(null);
  const [noticeRecipientName, setNoticeRecipientName] = useState("");
  const [noticeRecipientEmail, setNoticeRecipientEmail] = useState("");
  const [viewNotice, setViewNotice] = useState<Notice | null>(null);
  const [editingNotice, setEditingNotice] = useState(false);
  const [noticeEditContent, setNoticeEditContent] = useState("");
  const [changingNoticeStatus, setChangingNoticeStatus] = useState(false);
  const queryClient = useQueryClient();

  // ── Data Fetching ─────────────────────────────────────────────────────

  const { data: score, isLoading: scoreLoading } = useQuery({
    queryKey: ["compliance-score", projectId],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/compliance/score`
      );
      if (!res.ok) throw new Error("Failed to load compliance score");
      const json = await res.json();
      return json.data as ComplianceScore;
    },
  });

  const { data: deadlines, isLoading: deadlinesLoading } = useQuery({
    queryKey: ["compliance-deadlines", projectId, severityFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (severityFilter) params.set("severity", severityFilter);
      if (statusFilter) params.set("status", statusFilter);
      params.set("sortBy", "deadline");
      const res = await fetch(
        `/api/projects/${projectId}/compliance/deadlines?${params}`
      );
      if (!res.ok) throw new Error("Failed to load deadlines");
      const json = await res.json();
      return (json.data.deadlines ?? json.data) as Deadline[];
    },
  });

  const { data: clauses, isLoading: clausesLoading } = useQuery({
    queryKey: ["compliance-clauses", projectId],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/compliance/clauses`
      );
      if (!res.ok) throw new Error("Failed to load clauses");
      const json = await res.json();
      return json.data.clauses as Clause[];
    },
    enabled: activeTab === "clauses",
  });

  const { data: notices, isLoading: noticesLoading } = useQuery({
    queryKey: ["compliance-notices", projectId],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/compliance/notices`
      );
      if (!res.ok) throw new Error("Failed to load notices");
      const json = await res.json();
      return json.data.notices as Notice[];
    },
    enabled: activeTab === "notices",
  });

  const { data: scoreHistory } = useQuery({
    queryKey: ["compliance-score-history", projectId],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/compliance/score/history?period=month`
      );
      if (!res.ok) throw new Error("Failed to load score history");
      const json = await res.json();
      return json.data.history as ScoreHistory[];
    },
    enabled: showDashboard,
  });

  const { data: projectInfo } = useQuery({
    queryKey: ["project-info", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data as {
        gcCompanyName: string | null;
        gcContactName: string | null;
        gcContactEmail: string | null;
        gcContactPhone: string | null;
      };
    },
    enabled: !!viewNotice,
  });

  // ── Mutations ─────────────────────────────────────────────────────────

  const recalculateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/compliance/score/recalculate`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("Failed to recalculate");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["compliance-score", projectId],
      });
      toast.success("Score recalculated");
    },
    onError: () => toast.error("Failed to recalculate score"),
  });

  const waiveMutation = useMutation({
    mutationFn: async ({
      deadlineId,
      reason,
    }: {
      deadlineId: string;
      reason: string;
    }) => {
      const res = await fetch(
        `/api/projects/${projectId}/compliance/deadlines/${deadlineId}/waive`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        }
      );
      if (!res.ok) throw new Error("Failed to waive deadline");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["compliance-deadlines", projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["compliance-score", projectId],
      });
      setWaiveDialogOpen(false);
      setWaiveDeadlineId(null);
      setWaiveReason("");
      toast.success("Deadline waived");
    },
    onError: () => toast.error("Failed to waive deadline"),
  });

  const createNoticeMutation = useMutation({
    mutationFn: async ({
      deadlineId,
      clauseId,
      recipientName,
      recipientEmail,
    }: {
      deadlineId: string;
      clauseId: string;
      recipientName: string;
      recipientEmail?: string;
    }) => {
      const res = await fetch(
        `/api/projects/${projectId}/compliance/notices`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deadlineId,
            clauseId,
            recipientName,
            recipientEmail: recipientEmail || undefined,
            generateWithAI: true,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create notice");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["compliance-deadlines", projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["compliance-notices", projectId],
      });
      setCreateNoticeDeadline(null);
      setNoticeRecipientName("");
      setNoticeRecipientEmail("");
      toast.success("Notice drafted — review it in the Notices tab");
      // Switch to notices tab and open the new notice
      setActiveTab("notices");
      if (data.data) {
        setViewNotice(data.data as Notice);
      }
    },
    onError: (err: Error) =>
      toast.error(err.message || "Failed to create notice"),
  });

  const sendNoticeMutation = useMutation({
    mutationFn: async ({
      noticeId,
      methods,
    }: {
      noticeId: string;
      methods: string[];
    }) => {
      const res = await fetch(
        `/api/projects/${projectId}/compliance/notices/${noticeId}/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ methods }),
        }
      );
      if (!res.ok) throw new Error("Failed to send notice");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["compliance-notices", projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["compliance-deadlines", projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["compliance-score", projectId],
      });
      setViewNotice(null);
      toast.success("Notice sent");
    },
    onError: () => toast.error("Failed to send notice"),
  });

  const updateNoticeMutation = useMutation({
    mutationFn: async ({
      noticeId,
      content,
    }: {
      noticeId: string;
      content: string;
    }) => {
      const res = await fetch(
        `/api/projects/${projectId}/compliance/notices/${noticeId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update notice");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["compliance-notices", projectId],
      });
      setEditingNotice(false);
      if (data.data) {
        setViewNotice(data.data as Notice);
      }
      toast.success("Notice updated");
    },
    onError: (err: Error) =>
      toast.error(err.message || "Failed to update notice"),
  });

  const updateNoticeStatusMutation = useMutation({
    mutationFn: async ({
      noticeId,
      status,
    }: {
      noticeId: string;
      status: string;
    }) => {
      const res = await fetch(
        `/api/projects/${projectId}/compliance/notices/${noticeId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update status");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["compliance-notices", projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["compliance-deadlines", projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["compliance-score", projectId],
      });
      setChangingNoticeStatus(false);
      if (data.data) {
        setViewNotice(data.data as Notice);
      }
      toast.success("Notice status updated");
    },
    onError: (err: Error) =>
      toast.error(err.message || "Failed to update status"),
  });

  const deleteNoticeMutation = useMutation({
    mutationFn: async (noticeId: string) => {
      const res = await fetch(
        `/api/projects/${projectId}/compliance/notices/${noticeId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete notice");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["compliance-notices", projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["compliance-deadlines", projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["compliance-score", projectId],
      });
      setViewNotice(null);
      toast.success("Notice deleted");
    },
    onError: (err: Error) =>
      toast.error(err.message || "Failed to delete notice"),
  });

  // ── Derived Data ──────────────────────────────────────────────────────

  const allDeadlines = deadlines ?? [];
  const criticalCount = allDeadlines.filter(
    (d) => d.severity === "CRITICAL" || d.severity === "EXPIRED"
  ).length;
  const warningCount = allDeadlines.filter(
    (d) => d.severity === "WARNING"
  ).length;
  const activeDeadlines = allDeadlines.filter(
    (d) => d.status === "ACTIVE"
  );

  // ── Ticking Countdown ─────────────────────────────────────────────────

  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now()); // Set on mount to avoid hydration mismatch
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const getCountdown = useCallback(
    (deadline: string) => {
      if (now === 0) return "—"; // SSR / pre-mount placeholder
      const diff = new Date(deadline).getTime() - now;
      if (diff <= 0) return "EXPIRED";
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      if (days > 0) return `${days}d ${hours}h`;
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      return `${hours}h ${mins}m`;
    },
    [now]
  );

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-card px-6 py-2">
        <div className="flex items-center gap-2">
          <KpiChip
            icon={Shield}
            label="Score"
            value={score?.display.scorePercentage ?? "—"}
            accent="text-brand-orange"
            bg="bg-orange-50 dark:bg-orange-950/20"
          />
          <KpiChip
            icon={AlertTriangle}
            label="Critical"
            value={String(criticalCount)}
            accent={criticalCount > 0 ? "text-red-600" : "text-text-secondary"}
            bg={
              criticalCount > 0
                ? "bg-red-50 dark:bg-red-950/20"
                : "bg-gray-50 dark:bg-gray-800/30"
            }
          />
          <KpiChip
            icon={Clock}
            label="Active"
            value={String(score?.activeCount ?? 0)}
            accent="text-blue-600"
            bg="bg-blue-50 dark:bg-blue-950/20"
          />
          <KpiChip
            icon={Flame}
            label="Streak"
            value={
              score?.currentStreak
                ? `${score.currentStreak}`
                : "0"
            }
            accent={
              (score?.currentStreak ?? 0) > 0
                ? "text-emerald-600"
                : "text-text-secondary"
            }
            bg="bg-emerald-50 dark:bg-emerald-950/20"
          />
          <KpiChip
            icon={DollarSign}
            label="Protected"
            value={score ? formatCurrency(score.protectedClaimsValue) : "$0"}
            accent="text-amber-600"
            bg="bg-amber-50 dark:bg-amber-950/20"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={showDashboard ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1 text-[11px]"
            onClick={() => setShowDashboard(!showDashboard)}
          >
            <Activity className="h-3 w-3" />
            Dashboard
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-[11px]"
            onClick={() => recalculateMutation.mutate()}
            disabled={recalculateMutation.isPending}
          >
            <RefreshCw
              className={cn(
                "h-3 w-3",
                recalculateMutation.isPending && "animate-spin"
              )}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Dashboard Charts */}
      {showDashboard && (
        <div className="grid grid-cols-1 gap-4 border-b border-border-card p-4 md:grid-cols-3">
          {/* Score Ring */}
          <ScoreRingCard score={score} isLoading={scoreLoading} />

          {/* Score Trend */}
          <div className="rounded-lg border border-border-card bg-white p-4 dark:bg-card">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-medium text-text-secondary">
              <TrendingUp className="h-3.5 w-3.5" />
              Score Trend (30d)
            </h3>
            {scoreHistory && scoreHistory.length > 1 ? (
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={scoreHistory}>
                  <defs>
                    <linearGradient
                      id="scoreGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#C67F17"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="#C67F17"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => formatDateShort(d)}
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <RechartsTooltip
                    formatter={(value) => [`${Number(value).toFixed(0)}%`, "Score"]}
                    labelFormatter={(label) => formatDate(String(label))}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="compliancePercentage"
                    stroke="#C67F17"
                    strokeWidth={2}
                    fill="url(#scoreGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[120px] items-center justify-center text-xs text-text-secondary">
                Not enough data for trend chart
              </div>
            )}
          </div>

          {/* At-Risk Summary */}
          <div className="rounded-lg border border-border-card bg-white p-4 dark:bg-card">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-medium text-text-secondary">
              <AlertTriangle className="h-3.5 w-3.5" />
              Risk Summary
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">
                  Critical / Expired
                </span>
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    criticalCount > 0 ? "text-red-600" : "text-text-primary"
                  )}
                >
                  {criticalCount}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">Warning</span>
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    warningCount > 0
                      ? "text-amber-600"
                      : "text-text-primary"
                  )}
                >
                  {warningCount}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">At-Risk Value</span>
                <span className="text-sm font-semibold tabular-nums text-text-primary">
                  {score ? formatCurrency(score.atRiskValue) : "$0"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">Upcoming (14d)</span>
                <span className="text-sm font-semibold tabular-nums text-text-primary">
                  {score?.upcomingCount ?? 0}
                </span>
              </div>
              <div className="mt-2 border-t border-border-card pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-secondary">
                    Verdict
                  </span>
                  <span className="text-xs font-medium text-text-primary">
                    {score?.display.verdict ?? "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex items-center gap-0 border-b border-border-card px-6">
        <TabButton
          active={activeTab === "deadlines"}
          onClick={() => {
            setActiveTab("deadlines");
            setStatusFilter(null);
            setSeverityFilter(null);
          }}
          icon={Clock}
          label="Deadlines"
          count={score?.activeCount}
        />
        <TabButton
          active={activeTab === "clauses"}
          onClick={() => {
            setActiveTab("clauses");
            setStatusFilter(null);
            setSeverityFilter(null);
          }}
          icon={FileText}
          label="Clauses"
          count={clauses?.length}
        />
        <TabButton
          active={activeTab === "notices"}
          onClick={() => {
            setActiveTab("notices");
            setStatusFilter(null);
            setSeverityFilter(null);
          }}
          icon={Send}
          label="Notices"
          count={notices?.length}
        />

        {/* Filters */}
        <div className="ml-auto flex items-center gap-2 pb-1">
          {activeTab === "deadlines" && (
            <>
              <Select
                value={severityFilter ?? "ALL"}
                onValueChange={(v) =>
                  setSeverityFilter(v === "ALL" ? null : v)
                }
              >
                <SelectTrigger className="h-7 w-[120px] text-[11px]">
                  <Filter className="mr-1 h-3 w-3" />
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Severities</SelectItem>
                  <SelectItem value="EXPIRED">Expired</SelectItem>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                  <SelectItem value="WARNING">Warning</SelectItem>
                  <SelectItem value="INFO">Info</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={statusFilter ?? "ALL"}
                onValueChange={(v) =>
                  setStatusFilter(v === "ALL" ? null : v)
                }
              >
                <SelectTrigger className="h-7 w-[130px] text-[11px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="NOTICE_DRAFTED">Drafted</SelectItem>
                  <SelectItem value="NOTICE_SENT">Sent</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="EXPIRED">Expired</SelectItem>
                  <SelectItem value="WAIVED">Waived</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "deadlines" && (
          <DeadlinesTab
            deadlines={allDeadlines}
            isLoading={deadlinesLoading}
            getCountdown={getCountdown}
            onViewDetail={setDetailDeadline}
            onWaive={(id) => {
              setWaiveDeadlineId(id);
              setWaiveDialogOpen(true);
            }}
            onDraftNotice={(d) => setCreateNoticeDeadline(d)}
          />
        )}
        {activeTab === "clauses" && (
          <ClausesTab clauses={clauses ?? []} isLoading={clausesLoading} />
        )}
        {activeTab === "notices" && (
          <NoticesTab
            notices={notices ?? []}
            isLoading={noticesLoading}
            onViewNotice={setViewNotice}
          />
        )}
      </div>

      {/* Deadline Detail Dialog */}
      <Dialog
        open={!!detailDeadline}
        onOpenChange={(open) => {
          if (!open) setDetailDeadline(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {detailDeadline?.clauseTitle}
            </DialogTitle>
            <DialogDescription>
              {detailDeadline?.sectionRef ?? "No section reference"}
            </DialogDescription>
          </DialogHeader>
          {detailDeadline && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    SEVERITY_COLORS[detailDeadline.severity] ?? ""
                  }
                >
                  {detailDeadline.severity}
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    STATUS_COLORS[detailDeadline.status] ?? ""
                  }
                >
                  {detailDeadline.status.replace(/_/g, " ")}
                </Badge>
              </div>
              <div>
                <Label className="text-xs text-text-secondary">
                  Trigger
                </Label>
                <p className="mt-0.5">
                  {detailDeadline.triggerDescription}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-text-secondary">
                    Triggered
                  </Label>
                  <p className="mt-0.5">
                    {formatDate(detailDeadline.triggeredAt)}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-text-secondary">
                    Deadline
                  </Label>
                  <p className="mt-0.5">
                    {formatDate(detailDeadline.calculatedDeadline)}
                  </p>
                </div>
              </div>
              <div>
                <Label className="text-xs text-text-secondary">
                  Countdown
                </Label>
                <p
                  className={cn(
                    "mt-0.5 text-lg font-bold tabular-nums",
                    detailDeadline.severity === "EXPIRED"
                      ? "text-red-600"
                      : detailDeadline.severity === "CRITICAL"
                        ? "text-red-600"
                        : detailDeadline.severity === "WARNING"
                          ? "text-amber-600"
                          : "text-text-primary"
                  )}
                >
                  {getCountdown(detailDeadline.calculatedDeadline)}
                </p>
              </div>
              <div>
                <Label className="text-xs text-text-secondary">
                  Clause Type
                </Label>
                <p className="mt-0.5">
                  {formatKind(detailDeadline.clauseKind)}
                </p>
              </div>
              {detailDeadline.waivedAt && (
                <div>
                  <Label className="text-xs text-text-secondary">
                    Waiver Reason
                  </Label>
                  <p className="mt-0.5">
                    {detailDeadline.waiverReason}
                  </p>
                </div>
              )}
              {detailDeadline.status === "ACTIVE" &&
                !detailDeadline.noticeId && (
                  <div className="pt-2 border-t border-border-card">
                    <Button
                      size="sm"
                      className="w-full gap-1.5"
                      onClick={() => {
                        setDetailDeadline(null);
                        setCreateNoticeDeadline(detailDeadline);
                      }}
                    >
                      <Send className="h-3.5 w-3.5" />
                      Draft Notice for this Deadline
                    </Button>
                  </div>
                )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Waive Dialog */}
      <Dialog open={waiveDialogOpen} onOpenChange={setWaiveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Waive Deadline</DialogTitle>
            <DialogDescription>
              Waiving a deadline removes it from compliance tracking. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="waiveReason">Reason for waiver</Label>
              <Input
                id="waiveReason"
                value={waiveReason}
                onChange={(e) => setWaiveReason(e.target.value)}
                placeholder="e.g., Resolved through direct negotiation"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setWaiveDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={
                  !waiveReason.trim() || waiveMutation.isPending
                }
                onClick={() => {
                  if (waiveDeadlineId) {
                    waiveMutation.mutate({
                      deadlineId: waiveDeadlineId,
                      reason: waiveReason,
                    });
                  }
                }}
              >
                {waiveMutation.isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : null}
                Waive Deadline
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Notice Dialog */}
      <Dialog
        open={!!createNoticeDeadline}
        onOpenChange={(open) => {
          if (!open) {
            setCreateNoticeDeadline(null);
            setNoticeRecipientName("");
            setNoticeRecipientEmail("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4 text-brand-orange" />
              Draft Compliance Notice
            </DialogTitle>
            <DialogDescription>
              AI will generate a formal notice letter for this deadline. You can
              review and edit before sending.
            </DialogDescription>
          </DialogHeader>
          {createNoticeDeadline && (
            <div className="space-y-4">
              {/* Deadline info */}
              <div className="rounded-lg border border-border-card bg-gray-50/50 p-3 dark:bg-gray-800/30">
                <p className="text-sm font-medium text-text-primary">
                  {createNoticeDeadline.clauseTitle}
                </p>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {createNoticeDeadline.sectionRef} &middot; Due{" "}
                  {formatDate(createNoticeDeadline.calculatedDeadline)}
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  {createNoticeDeadline.triggerDescription}
                </p>
              </div>

              {/* Recipient info */}
              <div className="space-y-3">
                <div>
                  <Label htmlFor="recipientName">Recipient Name</Label>
                  <Input
                    id="recipientName"
                    value={noticeRecipientName}
                    onChange={(e) => setNoticeRecipientName(e.target.value)}
                    placeholder="e.g., John Smith, General Contractor"
                  />
                </div>
                <div>
                  <Label htmlFor="recipientEmail">
                    Recipient Email{" "}
                    <span className="text-text-secondary">(optional)</span>
                  </Label>
                  <Input
                    id="recipientEmail"
                    type="email"
                    value={noticeRecipientEmail}
                    onChange={(e) => setNoticeRecipientEmail(e.target.value)}
                    placeholder="e.g., john@contractor.com"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCreateNoticeDeadline(null);
                    setNoticeRecipientName("");
                    setNoticeRecipientEmail("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={
                    !noticeRecipientName.trim() ||
                    createNoticeMutation.isPending
                  }
                  onClick={() => {
                    createNoticeMutation.mutate({
                      deadlineId: createNoticeDeadline.id,
                      clauseId: createNoticeDeadline.clauseId,
                      recipientName: noticeRecipientName.trim(),
                      recipientEmail: noticeRecipientEmail.trim() || undefined,
                    });
                  }}
                >
                  {createNoticeMutation.isPending ? (
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  ) : (
                    <Zap className="mr-1.5 h-3 w-3" />
                  )}
                  Generate Notice with AI
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View Notice Dialog */}
      <Dialog
        open={!!viewNotice}
        onOpenChange={(open) => {
          if (!open) {
            setViewNotice(null);
            setEditingNotice(false);
            setChangingNoticeStatus(false);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {viewNotice?.title}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px]",
                  NOTICE_STATUS_COLORS[viewNotice?.status ?? ""] ?? ""
                )}
              >
                {viewNotice?.status?.replace(/_/g, " ")}
              </Badge>
              {viewNotice?.generatedByAI && (
                <span className="flex items-center gap-1 text-xs text-brand-orange">
                  <Zap className="h-3 w-3" /> AI Generated
                </span>
              )}
              {viewNotice?.recipientName && (
                <span className="text-xs">
                  To: {viewNotice.recipientName}
                  {viewNotice.recipientEmail
                    ? ` (${viewNotice.recipientEmail})`
                    : ""}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {viewNotice && (
            <div className="space-y-4">
              {/* GC Contact Info */}
              {(viewNotice.status === "DRAFT" ||
                viewNotice.status === "PENDING_REVIEW") &&
                projectInfo &&
                (projectInfo.gcCompanyName ||
                  projectInfo.gcContactName ||
                  projectInfo.gcContactEmail) && (
                  <div className="rounded-md border border-border-card bg-brand-off-white/50 px-3 py-2 dark:bg-muted/30">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                      GC Contact
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-primary">
                      {projectInfo.gcCompanyName && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3 text-text-secondary" />
                          {projectInfo.gcCompanyName}
                        </span>
                      )}
                      {projectInfo.gcContactName && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3 text-text-secondary" />
                          {projectInfo.gcContactName}
                        </span>
                      )}
                      {projectInfo.gcContactEmail && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3 text-text-secondary" />
                          {projectInfo.gcContactEmail}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-[10px] text-text-secondary">
                      {projectInfo.gcContactEmail
                        ? "This contact will be used when sending via email. For certified mail, use the address on file."
                        : "No email configured — notices can be sent via certified mail. Add an email in Project Settings."}
                    </p>
                  </div>
                )}

              {/* Notice content — view or edit */}
              {editingNotice ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-text-secondary">
                      Edit Notice Content
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px]"
                      onClick={() => {
                        setEditingNotice(false);
                        setNoticeEditContent("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                  <textarea
                    className="min-h-[300px] w-full rounded-lg border border-border-card bg-white p-4 font-[family-name:var(--font-dm-sans)] text-sm leading-relaxed text-text-primary focus:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange/30 dark:bg-card"
                    value={noticeEditContent}
                    onChange={(e) => setNoticeEditContent(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingNotice(false);
                        setNoticeEditContent("");
                      }}
                    >
                      Discard Changes
                    </Button>
                    <Button
                      size="sm"
                      disabled={
                        !noticeEditContent.trim() ||
                        noticeEditContent === viewNotice.content ||
                        updateNoticeMutation.isPending
                      }
                      onClick={() => {
                        updateNoticeMutation.mutate({
                          noticeId: viewNotice.id,
                          content: noticeEditContent,
                        });
                      }}
                    >
                      {updateNoticeMutation.isPending ? (
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-1.5 h-3 w-3" />
                      )}
                      Save Changes
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="group relative rounded-lg border border-border-card bg-white p-4 dark:bg-card">
                  {(viewNotice.status === "DRAFT" ||
                    viewNotice.status === "PENDING_REVIEW") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-2 h-7 gap-1 text-[11px] opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => {
                        setNoticeEditContent(viewNotice.content);
                        setEditingNotice(true);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </Button>
                  )}
                  <pre className="whitespace-pre-wrap font-[family-name:var(--font-dm-sans)] text-sm leading-relaxed text-text-primary">
                    {viewNotice.content}
                  </pre>
                </div>
              )}

              {/* Notice metadata */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <Label className="text-xs text-text-secondary">
                    Created
                  </Label>
                  <p className="mt-0.5">{formatDate(viewNotice.createdAt)}</p>
                </div>
                {viewNotice.sentAt && (
                  <div>
                    <Label className="text-xs text-text-secondary">Sent</Label>
                    <p className="mt-0.5">{formatDate(viewNotice.sentAt)}</p>
                  </div>
                )}
                {viewNotice.onTimeStatus !== null && (
                  <div>
                    <Label className="text-xs text-text-secondary">
                      Delivery
                    </Label>
                    <p
                      className={cn(
                        "mt-0.5 font-medium",
                        viewNotice.onTimeStatus
                          ? "text-emerald-600"
                          : "text-red-600"
                      )}
                    >
                      {viewNotice.onTimeStatus ? "On time" : "Late"}
                    </p>
                  </div>
                )}
              </div>

              {/* Action bar */}
              {!editingNotice && (
                <div className="flex flex-wrap items-center gap-2 border-t border-border-card pt-3">
                  {/* Status change */}
                  <span className="text-xs font-medium text-text-secondary">
                    Status:
                  </span>
                  {changingNoticeStatus ? (
                    <Select
                      value={viewNotice.status}
                      onValueChange={(v) => {
                        if (v !== viewNotice.status) {
                          updateNoticeStatusMutation.mutate({
                            noticeId: viewNotice.id,
                            status: v,
                          });
                        }
                        setChangingNoticeStatus(false);
                      }}
                    >
                      <SelectTrigger className="h-7 w-[160px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          "DRAFT",
                          "PENDING_REVIEW",
                          "SENT",
                          "ACKNOWLEDGED",
                          "EXPIRED",
                          "VOID",
                        ].map((s) => (
                          <SelectItem key={s} value={s}>
                            {s.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setChangingNoticeStatus(true)}
                      disabled={updateNoticeStatusMutation.isPending}
                    >
                      {updateNoticeStatusMutation.isPending && (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      )}
                      Change Status
                    </Button>
                  )}

                  {/* Edit + Delete + Send for draft notices */}
                  <div className="ml-auto flex items-center gap-2">
                    {(viewNotice.status === "DRAFT" ||
                      viewNotice.status === "PENDING_REVIEW") && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                          disabled={deleteNoticeMutation.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Are you sure you want to delete this notice?"
                              )
                            ) {
                              deleteNoticeMutation.mutate(viewNotice.id);
                            }
                          }}
                        >
                          {deleteNoticeMutation.isPending ? (
                            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="mr-1.5 h-3 w-3" />
                          )}
                          Delete
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setNoticeEditContent(viewNotice.content);
                            setEditingNotice(true);
                          }}
                        >
                          <Pencil className="mr-1.5 h-3 w-3" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={sendNoticeMutation.isPending}
                          onClick={() => {
                            sendNoticeMutation.mutate({
                              noticeId: viewNotice.id,
                              methods: ["EMAIL"],
                            });
                          }}
                        >
                          {sendNoticeMutation.isPending ? (
                            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                          ) : (
                            <Send className="mr-1.5 h-3 w-3" />
                          )}
                          Send via Email
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-Components ────────────────────────────────────────────────────────

function KpiChip({
  icon: Icon,
  label,
  value,
  accent,
  bg,
  active,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent: string;
  bg: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
        bg,
        active
          ? "border-brand-orange ring-1 ring-brand-orange/30"
          : "border-transparent",
        disabled
          ? "cursor-default opacity-60"
          : onClick
            ? "cursor-pointer hover:opacity-80"
            : "cursor-default"
      )}
    >
      <Icon className={cn("h-3 w-3", accent)} />
      <span className="text-text-secondary">{label}</span>
      <span className={cn("font-semibold tabular-nums", accent)}>
        {value}
      </span>
    </button>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors",
        active
          ? "border-brand-orange text-brand-orange"
          : "border-transparent text-text-secondary hover:text-text-primary"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "ml-1 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
            active
              ? "bg-orange-100 text-brand-orange dark:bg-orange-950/30"
              : "bg-gray-100 text-gray-500 dark:bg-gray-800"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function ScoreRingCard({
  score,
  isLoading,
}: {
  score?: ComplianceScore;
  isLoading: boolean;
}) {
  const percentage = score?.score ?? 0;
  const circumference = 2 * Math.PI * 42;
  const dashOffset = circumference - (percentage / 100) * circumference;
  const color =
    percentage >= 90
      ? "#0F8A5F"
      : percentage >= 70
        ? "#C67F17"
        : "#DC2626";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border-card bg-white p-4 dark:bg-card">
        <Skeleton className="h-[120px] w-[120px] rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border-card bg-white p-4 dark:bg-card">
      <div className="relative flex-shrink-0">
        <svg width="100" height="100" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-gray-100 dark:text-gray-800"
          />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 50 50)"
            className="transition-all duration-700"
          />
          <text
            x="50"
            y="46"
            textAnchor="middle"
            className="fill-text-primary text-xl font-bold"
            style={{ fontSize: "22px", fontWeight: 700 }}
          >
            {score?.display.scorePercentage ?? "—"}
          </text>
          <text
            x="50"
            y="62"
            textAnchor="middle"
            className="fill-text-secondary"
            style={{ fontSize: "9px" }}
          >
            compliance
          </text>
        </svg>
      </div>
      <div className="space-y-1.5">
        <div className="text-xs text-text-secondary">
          {score?.display.streakDisplay ?? "No data"}
        </div>
        <div className="text-xs text-text-secondary">
          {score
            ? `${score.onTimeCount}/${score.totalCount} on time`
            : "No notices tracked"}
        </div>
        <div className="text-xs font-medium text-text-primary">
          {score?.display.protectedValue ?? "$0 protected"}
        </div>
      </div>
    </div>
  );
}

// ── Tab Content: Deadlines ──────────────────────────────────────────────

function DeadlinesTab({
  deadlines,
  isLoading,
  getCountdown,
  onViewDetail,
  onWaive,
  onDraftNotice,
}: {
  deadlines: Deadline[];
  isLoading: boolean;
  getCountdown: (deadline: string) => string;
  onViewDetail: (d: Deadline) => void;
  onWaive: (id: string) => void;
  onDraftNotice: (d: Deadline) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (deadlines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-400" />
        <h3 className="text-sm font-medium text-text-primary">
          No deadlines found
        </h3>
        <p className="mt-1 text-xs text-text-secondary">
          Deadlines are created when trigger events are logged against
          contract clauses.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border-card">
      {deadlines.map((d) => {
        const countdown = getCountdown(d.calculatedDeadline);
        const isExpired = countdown === "EXPIRED";
        return (
          <div
            key={d.id}
            className="group flex items-center gap-4 px-6 py-3 transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-800/20"
          >
            {/* Severity indicator */}
            <div
              className={cn(
                "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full",
                d.severity === "EXPIRED" || d.severity === "CRITICAL"
                  ? "bg-red-100 dark:bg-red-950/30"
                  : d.severity === "WARNING"
                    ? "bg-amber-100 dark:bg-amber-950/30"
                    : d.severity === "INFO"
                      ? "bg-blue-100 dark:bg-blue-950/30"
                      : "bg-gray-100 dark:bg-gray-800"
              )}
            >
              {d.severity === "EXPIRED" ? (
                <XCircle className="h-4 w-4 text-red-600" />
              ) : d.severity === "CRITICAL" ? (
                <AlertTriangle className="h-4 w-4 text-red-600" />
              ) : d.severity === "WARNING" ? (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              ) : (
                <Clock className="h-4 w-4 text-text-secondary" />
              )}
            </div>

            {/* Main content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-text-primary">
                  {d.clauseTitle}
                </span>
                {d.sectionRef && (
                  <span className="flex-shrink-0 text-[10px] text-text-secondary">
                    {d.sectionRef}
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-text-secondary">
                {d.triggerDescription}
              </p>
            </div>

            {/* Countdown */}
            <div className="flex-shrink-0 text-right">
              <p
                className={cn(
                  "text-sm font-bold tabular-nums",
                  isExpired
                    ? "text-red-600"
                    : d.severity === "CRITICAL"
                      ? "text-red-600"
                      : d.severity === "WARNING"
                        ? "text-amber-600"
                        : "text-text-primary"
                )}
              >
                {countdown}
              </p>
              <p className="text-[10px] text-text-secondary">
                {formatDateShort(d.calculatedDeadline)}
              </p>
            </div>

            {/* Status badge */}
            <Badge
              variant="outline"
              className={cn(
                "flex-shrink-0 text-[10px]",
                STATUS_COLORS[d.status] ?? ""
              )}
            >
              {d.status.replace(/_/g, " ")}
            </Badge>

            {/* Actions */}
            <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                title="View details"
                onClick={() => onViewDetail(d)}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
              {d.status === "ACTIVE" && !d.noticeId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-text-secondary hover:text-brand-orange"
                  title="Draft notice"
                  onClick={() => onDraftNotice(d)}
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              )}
              {d.status === "ACTIVE" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-text-secondary hover:text-red-600"
                  title="Waive deadline"
                  onClick={() => onWaive(d.id)}
                >
                  <CircleOff className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tab Content: Clauses ────────────────────────────────────────────────

function ClausesTab({
  clauses,
  isLoading,
}: {
  clauses: Clause[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (clauses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FileText className="mb-3 h-10 w-10 text-gray-300" />
        <h3 className="text-sm font-medium text-text-primary">
          No clauses extracted
        </h3>
        <p className="mt-1 text-xs text-text-secondary">
          Upload a contract and parse it to extract notice clauses.
        </p>
      </div>
    );
  }

  const reviewCount = clauses.filter((c) => c.requiresReview).length;

  return (
    <div>
      {reviewCount > 0 && (
        <div className="border-b border-amber-200 bg-amber-50/50 px-6 py-2 dark:border-amber-800 dark:bg-amber-950/20">
          <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            {reviewCount} clause{reviewCount !== 1 ? "s" : ""} flagged for
            human review
          </p>
        </div>
      )}
      <div className="divide-y divide-border-card">
        {clauses.map((c) => (
          <div key={c.id} className="px-6 py-3">
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg",
                  c.requiresReview
                    ? "bg-amber-100 dark:bg-amber-950/30"
                    : c.confirmed
                      ? "bg-emerald-100 dark:bg-emerald-950/30"
                      : "bg-gray-100 dark:bg-gray-800"
                )}
              >
                {c.requiresReview ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                ) : c.confirmed ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-text-secondary" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-text-primary">
                    {c.title}
                  </span>
                  {c.sectionRef && (
                    <span className="text-[10px] text-text-secondary">
                      {c.sectionRef}
                    </span>
                  )}
                  {c.aiExtracted && (
                    <Zap className="h-3 w-3 flex-shrink-0 text-brand-orange" />
                  )}
                </div>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {formatKind(c.kind)}
                  {c.deadlineDays
                    ? ` · ${c.deadlineDays} ${(c.deadlineType ?? "CALENDAR_DAYS").replace(/_/g, " ").toLowerCase()}`
                    : ""}
                  {c.noticeMethod
                    ? ` · ${c.noticeMethod.replace(/_/g, " ").toLowerCase()}`
                    : ""}
                </p>
              </div>

              {c.requiresReview ? (
                <Badge
                  variant="outline"
                  className="flex-shrink-0 bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300"
                >
                  Needs Review
                </Badge>
              ) : c.confirmed ? (
                <Badge
                  variant="outline"
                  className="flex-shrink-0 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300"
                >
                  Confirmed
                </Badge>
              ) : (
                <Badge variant="outline" className="flex-shrink-0 text-text-secondary">
                  Pending
                </Badge>
              )}
            </div>

            {c.requiresReview && c.reviewReason && (
              <div className="ml-12 mt-1.5 rounded-md border border-amber-200 bg-amber-50/50 px-3 py-1.5 dark:border-amber-800 dark:bg-amber-950/20">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  <span className="font-medium">Review needed:</span>{" "}
                  {c.reviewReason}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab Content: Notices ────────────────────────────────────────────────

function NoticesTab({
  notices,
  isLoading,
  onViewNotice,
}: {
  notices: Notice[];
  isLoading: boolean;
  onViewNotice: (n: Notice) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (notices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Send className="mb-3 h-10 w-10 text-gray-300" />
        <h3 className="text-sm font-medium text-text-primary">
          No notices yet
        </h3>
        <p className="mt-1 max-w-xs text-xs text-text-secondary">
          Go to the Deadlines tab and click the{" "}
          <Send className="inline h-3 w-3" /> button on any active deadline to
          draft an AI-generated notice letter.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border-card">
      {notices.map((n) => (
        <div
          key={n.id}
          className="group flex cursor-pointer items-center gap-4 px-6 py-3 transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-800/20"
          onClick={() => onViewNotice(n)}
        >
          <div
            className={cn(
              "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg",
              n.status === "SENT" || n.status === "ACKNOWLEDGED"
                ? "bg-emerald-100 dark:bg-emerald-950/30"
                : n.status === "EXPIRED"
                  ? "bg-red-100 dark:bg-red-950/30"
                  : "bg-gray-100 dark:bg-gray-800"
            )}
          >
            {n.status === "ACKNOWLEDGED" ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            ) : n.status === "SENT" ? (
              <Send className="h-3.5 w-3.5 text-blue-600" />
            ) : n.status === "EXPIRED" ? (
              <XCircle className="h-3.5 w-3.5 text-red-600" />
            ) : (
              <FileText className="h-3.5 w-3.5 text-text-secondary" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-text-primary">
                {n.title}
              </span>
              {n.generatedByAI && (
                <Zap className="h-3 w-3 flex-shrink-0 text-brand-orange" />
              )}
            </div>
            <p className="mt-0.5 text-xs text-text-secondary">
              {formatKind(n.type)}
              {n.recipientName ? ` · To: ${n.recipientName}` : ""}
              {n.sentAt ? ` · Sent ${formatDate(n.sentAt)}` : ""}
              {n.onTimeStatus === true
                ? " · On time"
                : n.onTimeStatus === false
                  ? " · Late"
                  : ""}
            </p>
          </div>

          <Badge
            variant="outline"
            className={cn(
              "flex-shrink-0 text-[10px]",
              NOTICE_STATUS_COLORS[n.status] ?? ""
            )}
          >
            {n.status.replace(/_/g, " ")}
          </Badge>

          <span className="flex-shrink-0 text-[10px] text-text-secondary">
            {formatDate(n.createdAt)}
          </span>

          <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              title="View notice"
              onClick={(e) => {
                e.stopPropagation();
                onViewNotice(n);
              }}
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
