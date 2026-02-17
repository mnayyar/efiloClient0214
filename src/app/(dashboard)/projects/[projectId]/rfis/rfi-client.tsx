"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileWarning,
  Plus,
  Filter,
  Loader2,
  AlertCircle,
  Clock,
  ChevronRight,
  ArrowRight,
  Sparkles,
  FileText,
  Trash2,
  X,
  Brain,
  Mail,
  DollarSign,
  Activity,
  Building2,
  User,
  Pencil,
  Check,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
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
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface RFI {
  id: string;
  rfiNumber: string;
  subject: string;
  question: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  dueDate: string | null;
  submittedAt: string | null;
  respondedAt: string | null;
  response: string | null;
  aiDraftQuestion: string | null;
  aiDraftModel: string | null;
  aiResponseAnalysis: string | null;
  coFlag: boolean;
  coEstimate: number | null;
  isOverdue: boolean;
  sourceDocIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface ProjectDocument {
  id: string;
  name: string;
  type: string;
  status: string;
}

interface ProjectInfo {
  gcCompanyName: string | null;
  gcContactName: string | null;
  gcContactEmail: string | null;
}

interface RfiClientProps {
  projectId: string;
}

const STATUS_OPTIONS = [
  "DRAFT",
  "SUBMITTED",
  "PENDING_GC",
  "OPEN",
  "ANSWERED",
  "CLOSED",
  "VOID",
] as const;

const PRIORITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
  SUBMITTED: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800",
  PENDING_GC: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
  OPEN: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
  ANSWERED: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800",
  CLOSED: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  VOID: "bg-red-100 text-red-600 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800",
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  MEDIUM: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
  CRITICAL: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
};

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type DashboardFilter =
  | { type: "overdue"; label: string }
  | { type: "co"; label: string }
  | { type: "status"; status: string; label: string }
  | { type: "aging"; minDays: number; maxDays: number; label: string }
  | null;

const OPEN_STATUSES = new Set(["SUBMITTED", "PENDING_GC", "OPEN"]);

function applyDashboardFilter(rfis: RFI[], filter: DashboardFilter): RFI[] {
  if (!filter) return rfis;
  const now = Date.now();
  switch (filter.type) {
    case "overdue":
      return rfis.filter((r) => r.isOverdue);
    case "co":
      return rfis.filter((r) => r.coFlag);
    case "status":
      return rfis.filter((r) => r.status === filter.status);
    case "aging":
      return rfis.filter((r) => {
        if (!OPEN_STATUSES.has(r.status)) return false;
        const days = Math.floor((now - new Date(r.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        return days >= filter.minDays && days <= filter.maxDays;
      });
    default:
      return rfis;
  }
}

export function RfiPageClient({ projectId }: RfiClientProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [detailRfi, setDetailRfi] = useState<RFI | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);
  const [dashboardFilter, setDashboardFilter] = useState<DashboardFilter>(null);
  const [showDashboard, setShowDashboard] = useState(true);
  const queryClient = useQueryClient();

  const { data: allRfis, isLoading } = useQuery({
    queryKey: ["rfis", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/rfis`);
      if (!res.ok) throw new Error("Failed to load RFIs");
      const json = await res.json();
      return json.data as RFI[];
    },
  });

  const rfis = useMemo(() => {
    let filtered = allRfis ?? [];
    // Apply dashboard filter
    filtered = applyDashboardFilter(filtered, dashboardFilter);
    // Apply status dropdown filter
    if (statusFilter) filtered = filtered.filter((r) => r.status === statusFilter);
    // Apply priority dropdown filter
    if (priorityFilter) filtered = filtered.filter((r) => r.priority === priorityFilter);
    return filtered;
  }, [allRfis, dashboardFilter, statusFilter, priorityFilter]);

  function handleDashboardFilter(filter: DashboardFilter) {
    // Clear dropdown filters when using dashboard filter
    setStatusFilter(null);
    setPriorityFilter(null);
    setDashboardFilter(filter);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-card px-6 py-2">
        <div className="flex items-center gap-2">
          {/* KPI chips */}
          <KpiChip
            icon={FileText}
            label="Total"
            value={String((allRfis ?? []).length)}
            accent="text-brand-orange"
            bg="bg-orange-50 dark:bg-orange-950/20"
            active={!dashboardFilter}
            onClick={() => handleDashboardFilter(null)}
          />
          <KpiChip
            icon={AlertCircle}
            label="Overdue"
            value={String((allRfis ?? []).filter((r) => r.isOverdue).length)}
            accent={(allRfis ?? []).some((r) => r.isOverdue) ? "text-red-600" : "text-text-secondary"}
            bg={(allRfis ?? []).some((r) => r.isOverdue) ? "bg-red-50 dark:bg-red-950/20" : "bg-gray-50 dark:bg-gray-800/30"}
            active={dashboardFilter?.type === "overdue"}
            disabled={!(allRfis ?? []).some((r) => r.isOverdue)}
            onClick={() => handleDashboardFilter({ type: "overdue", label: "Overdue RFIs" })}
          />
          <KpiChip
            icon={Clock}
            label="Avg Resp"
            value={(() => {
              const times = (allRfis ?? [])
                .filter((r) => r.submittedAt && r.respondedAt)
                .map((r) => (new Date(r.respondedAt!).getTime() - new Date(r.submittedAt!).getTime()) / 86400000);
              return times.length > 0 ? `${Math.round(times.reduce((a, b) => a + b, 0) / times.length)}d` : "—";
            })()}
            accent="text-blue-600"
            bg="bg-blue-50 dark:bg-blue-950/20"
          />
          <KpiChip
            icon={DollarSign}
            label="Potential CO"
            value={(() => {
              const co = (allRfis ?? []).filter((r) => r.coFlag);
              return co.length > 0 ? String(co.length) : "None";
            })()}
            accent={(allRfis ?? []).some((r) => r.coFlag) ? "text-amber-600" : "text-text-secondary"}
            bg="bg-amber-50 dark:bg-amber-950/20"
            active={dashboardFilter?.type === "co"}
            disabled={!(allRfis ?? []).some((r) => r.coFlag)}
            onClick={() => handleDashboardFilter({ type: "co", label: "Change Order Exposure" })}
          />

          {/* Active filter chip */}
          {dashboardFilter && (
            <span className="inline-flex items-center gap-1 rounded-full border border-brand-orange/30 bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-brand-orange dark:bg-orange-950/20">
              {dashboardFilter.label}
              <button
                onClick={() => setDashboardFilter(null)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-orange-100 dark:hover:bg-orange-900/30"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {(allRfis ?? []).length > 0 && (
            <Button
              variant={showDashboard ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1 text-[11px]"
              onClick={() => setShowDashboard(!showDashboard)}
            >
              <Activity className="h-3 w-3" />
              Dashboard
            </Button>
          )}

          <Select
            value={statusFilter ?? "ALL"}
            onValueChange={(v) => {
              setStatusFilter(v === "ALL" ? null : v);
              setDashboardFilter(null);
            }}
          >
            <SelectTrigger className="h-7 w-[130px] text-[11px]">
              <Filter className="mr-1 h-3 w-3" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {formatStatus(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={priorityFilter ?? "ALL"}
            onValueChange={(v) => {
              setPriorityFilter(v === "ALL" ? null : v);
              setDashboardFilter(null);
            }}
          >
            <SelectTrigger className="h-7 w-[120px] text-[11px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Priorities</SelectItem>
              {PRIORITY_OPTIONS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(allRfis ?? []).length > 0 && (
            <Button size="sm" className="h-7 text-[11px]" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Create RFI
            </Button>
          )}
        </div>
      </div>

      {/* Dashboard */}
      {showDashboard && (allRfis ?? []).length > 0 && (
        <RfiDashboard
          rfis={allRfis ?? []}
          activeFilter={dashboardFilter}
          onFilter={handleDashboardFilter}
        />
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : rfis.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6">
            {statusFilter || priorityFilter || dashboardFilter ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-card py-12 px-8">
                <Filter className="h-8 w-8 text-text-secondary" />
                <p className="text-sm text-text-secondary">
                  No RFIs match the current filters
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStatusFilter(null);
                    setPriorityFilter(null);
                    setDashboardFilter(null);
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            ) : (
              <div className="w-full max-w-lg">
                <div className="flex justify-center">
                  <div className="relative">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-orange-500/20">
                      <FileWarning className="h-8 w-8 text-white" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand-orange shadow-md">
                      <Plus className="h-3.5 w-3.5 text-white" />
                    </div>
                  </div>
                </div>
                <h3 className="mt-5 text-center text-lg font-semibold text-text-primary">
                  Track Requests for Information
                </h3>
                <p className="mt-1.5 text-center text-sm leading-relaxed text-text-secondary">
                  Create and manage RFIs to get clarifications on project documents.
                  Track status, assign to parties, and monitor response timelines.
                </p>
                <div className="mt-6 grid grid-cols-3 gap-3">
                  {[
                    { icon: Clock, title: "Due Date Tracking", desc: "Monitor response deadlines" },
                    { icon: AlertCircle, title: "Priority Levels", desc: "Low to Critical urgency" },
                    { icon: ArrowRight, title: "Status Workflow", desc: "Draft to Closed lifecycle" },
                  ].map((feature) => (
                    <div
                      key={feature.title}
                      className="flex flex-col items-center rounded-lg border border-border-card bg-brand-off-white/50 px-3 py-4 text-center dark:bg-muted/50"
                    >
                      <feature.icon className="h-4 w-4 text-brand-orange" />
                      <p className="mt-2 text-xs font-semibold text-text-primary">{feature.title}</p>
                      <p className="mt-0.5 text-[11px] text-text-secondary">{feature.desc}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex justify-center">
                  <Button onClick={() => setCreateOpen(true)} size="lg">
                    <Plus className="mr-2 h-4 w-4" />
                    Create RFI
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-card bg-brand-off-white dark:bg-muted">
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">RFI #</th>
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Subject</th>
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-text-secondary">Priority</th>
                  <th className="hidden px-4 py-3 text-left font-medium text-text-secondary lg:table-cell">Due Date</th>
                  <th className="hidden px-4 py-3 text-left font-medium text-text-secondary sm:table-cell">Created</th>
                  <th className="px-4 py-3 text-right font-medium text-text-secondary"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rfis.map((rfi) => (
                  <tr
                    key={rfi.id}
                    onClick={() => setDetailRfi(rfi)}
                    className="cursor-pointer border-b border-border-card last:border-0 transition-colors hover:bg-brand-off-white/50 dark:hover:bg-muted/50"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-brand-orange">{rfi.rfiNumber}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-text-primary max-w-[300px]">{rfi.subject}</span>
                        {rfi.isOverdue && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                        {rfi.coFlag && (
                          <Badge variant="outline" className="shrink-0 text-[10px] border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">CO</Badge>
                        )}
                        {rfi.aiResponseAnalysis && (
                          <Brain className="h-3.5 w-3.5 shrink-0 text-purple-500" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium", STATUS_COLORS[rfi.status] ?? "bg-gray-100 text-gray-600")}>
                        {formatStatus(rfi.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", PRIORITY_COLORS[rfi.priority] ?? "bg-gray-100 text-gray-600")}>
                        {rfi.priority}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      {rfi.dueDate ? (
                        <span className={cn("flex items-center gap-1 text-text-secondary", rfi.isOverdue && "text-red-500 font-medium")}>
                          <Clock className="h-3 w-3" />
                          {formatDate(rfi.dueDate)}
                        </span>
                      ) : (
                        <span className="text-text-secondary">—</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-text-secondary sm:table-cell">{formatDate(rfi.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight className="inline h-4 w-4 text-text-secondary" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateRfiDialog
        projectId={projectId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["rfis", projectId] });
        }}
      />

      <RfiDetailDialog
        projectId={projectId}
        rfi={detailRfi}
        onClose={() => setDetailRfi(null)}
        onUpdated={() => {
          queryClient.invalidateQueries({ queryKey: ["rfis", projectId] });
        }}
      />
    </div>
  );
}

/* ── KPI Chip ──────────────────────────────────────────────── */

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
  const interactive = !!onClick && !disabled;
  const Tag = interactive ? "button" : "div";
  return (
    <Tag
      onClick={interactive ? onClick : undefined}
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1 text-left transition-all",
        bg,
        interactive && "hover:ring-1 hover:ring-brand-orange/30",
        active ? "border-brand-orange ring-1 ring-brand-orange/30" : "border-border-card",
        disabled && "cursor-default"
      )}
    >
      <Icon className={cn("h-3 w-3 shrink-0", accent)} />
      <span className="text-[10px] font-medium text-text-secondary">{label}</span>
      <span className={cn("text-sm font-bold leading-none", accent)}>{value}</span>
    </Tag>
  );
}

/* ── RFI Dashboard ─────────────────────────────────────────── */

const AGING_BRACKETS = [
  { label: "0-7 days", max: 7, color: "#0F8A5F" },
  { label: "8-14 days", max: 14, color: "#C67F17" },
  { label: "15-21 days", max: 21, color: "#EA580C" },
  { label: "21+ days", max: Infinity, color: "#DC2626" },
] as const;

const PIPELINE_STATUSES = ["DRAFT", "SUBMITTED", "PENDING_GC", "OPEN", "ANSWERED", "CLOSED", "VOID"] as const;

const PIPELINE_COLORS: Record<string, string> = {
  DRAFT: "#9CA3AF",
  SUBMITTED: "#3B82F6",
  PENDING_GC: "#F59E0B",
  OPEN: "#10B981",
  ANSWERED: "#8B5CF6",
  CLOSED: "#64748B",
  VOID: "#EF4444",
};

function RfiDashboard({
  rfis,
  activeFilter,
  onFilter,
}: {
  rfis: RFI[];
  activeFilter: DashboardFilter;
  onFilter: (filter: DashboardFilter) => void;
}) {
  const stats = useMemo(() => {
    const now = Date.now();
    const openStatuses = new Set(["SUBMITTED", "PENDING_GC", "OPEN"]);

    // Aging breakdown (open RFIs only)
    const aging = AGING_BRACKETS.map((b) => ({ ...b, count: 0 }));
    for (const r of rfis) {
      if (!openStatuses.has(r.status)) continue;
      const daysOpen = Math.floor((now - new Date(r.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      const bracket = aging.find((b, i) => {
        const min = i === 0 ? 0 : AGING_BRACKETS[i - 1].max + 1;
        return daysOpen >= min && daysOpen <= b.max;
      });
      if (bracket) bracket.count++;
    }

    // Status pipeline
    const pipeline = PIPELINE_STATUSES.map((s) => ({
      status: s,
      label: s.replace(/_/g, " "),
      count: rfis.filter((r) => r.status === s).length,
      color: PIPELINE_COLORS[s],
    }));

    // Recent activity (last 5 updated)
    const recentActivity = [...rfis]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);

    return { aging, pipeline, recentActivity };
  }, [rfis]);

  function isActive(type: string, extra?: string) {
    if (!activeFilter) return false;
    if (activeFilter.type !== type) return false;
    if (type === "status" && activeFilter.type === "status") return activeFilter.status === extra;
    if (type === "aging" && activeFilter.type === "aging") return activeFilter.label === extra;
    return true;
  }

  return (
    <div className="border-b border-border-card bg-brand-off-white/30 px-6 py-3 dark:bg-muted/20">
      <div className="grid gap-3 lg:grid-cols-3">
        {/* Aging Breakdown */}
        <div className="rounded-lg border border-border-card bg-white p-3 dark:bg-background">
          <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
            Open RFI Aging
          </h4>
          <div className="h-[110px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stats.aging}
                margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
                style={{ cursor: "pointer" }}
              >
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: "#57534E" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "#57534E" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 6,
                    border: "1px solid #E8E5DE",
                  }}
                  formatter={(value) => [String(value ?? 0), "RFIs"]}
                />
                <Bar
                  dataKey="count"
                  radius={[4, 4, 0, 0]}
                  onClick={(_data, _index, e) => {
                    const d = _data as unknown as { count: number; label: string; max: number };
                    if (!d || d.count === 0) return;
                    const idx = stats.aging.findIndex((a) => a.label === d.label);
                    const minDays = idx === 0 ? 0 : AGING_BRACKETS[idx - 1].max + 1;
                    const maxDays = d.max === Infinity ? 99999 : d.max;
                    onFilter({ type: "aging", minDays, maxDays, label: `Aging: ${d.label}` });
                  }}
                >
                  {stats.aging.map((entry, i) => {
                    const agingLabel = `Aging: ${entry.label}`;
                    const active = activeFilter?.type === "aging" && activeFilter.label === agingLabel;
                    return (
                      <Cell
                        key={i}
                        fill={entry.color}
                        opacity={active ? 1 : 0.7}
                        stroke={active ? entry.color : "none"}
                        strokeWidth={2}
                        style={{ cursor: entry.count > 0 ? "pointer" : "default" }}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Pipeline */}
        <div className="rounded-lg border border-border-card bg-white p-3 dark:bg-background">
          <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
            Status Pipeline
          </h4>
          <div className="flex gap-1">
            {stats.pipeline.map((s) => (
              <button
                key={s.status}
                onClick={() =>
                  s.count > 0 &&
                  onFilter({ type: "status", status: s.status, label: formatStatus(s.status) })
                }
                className={cn(
                  "flex-1 text-center rounded py-1 transition-all",
                  s.count > 0 && "hover:ring-2 hover:ring-brand-orange/20",
                  isActive("status", s.status) && "ring-2 ring-brand-orange/40",
                  s.count === 0 && "cursor-default opacity-50"
                )}
              >
                <div
                  className="mx-auto mb-0.5 flex h-7 items-center justify-center rounded"
                  style={{ backgroundColor: s.color + "18" }}
                >
                  <span
                    className="text-xs font-bold"
                    style={{ color: s.color }}
                  >
                    {s.count}
                  </span>
                </div>
                <span className="text-[8px] font-medium leading-tight text-text-secondary">
                  {s.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-lg border border-border-card bg-white p-3 dark:bg-background">
          <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
            Recent Activity
          </h4>
          <div className="space-y-1">
            {stats.recentActivity.map((r) => (
              <button
                key={r.id}
                onClick={() =>
                  onFilter({ type: "status", status: r.status, label: formatStatus(r.status) })
                }
                className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-[11px] text-left transition-colors hover:bg-brand-off-white dark:hover:bg-muted"
              >
                <span
                  className={cn(
                    "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                    r.status === "DRAFT" && "bg-gray-400",
                    r.status === "SUBMITTED" && "bg-blue-500",
                    r.status === "PENDING_GC" && "bg-amber-500",
                    r.status === "OPEN" && "bg-emerald-500",
                    r.status === "ANSWERED" && "bg-purple-500",
                    r.status === "CLOSED" && "bg-slate-500",
                    r.status === "VOID" && "bg-red-500"
                  )}
                />
                <span className="font-mono text-[10px] font-semibold text-brand-orange">
                  {r.rfiNumber}
                </span>
                <span className="truncate text-text-primary">{r.subject}</span>
                <span className="ml-auto shrink-0 text-[9px] text-text-secondary">
                  {formatDate(r.updatedAt)}
                </span>
              </button>
            ))}
            {stats.recentActivity.length === 0 && (
              <p className="text-[11px] text-text-secondary">No activity yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Create RFI Dialog ──────────────────────────────────────── */

function CreateRfiDialog({
  projectId,
  open,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [aiDraft, setAiDraft] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState(false);
  const [draftEditText, setDraftEditText] = useState("");
  const [sendAfterCreate, setSendAfterCreate] = useState(false);

  // Fetch project info for GC contact display
  const { data: projectInfo } = useQuery({
    queryKey: ["project-info", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data as ProjectInfo;
    },
    enabled: open,
  });

  // Fetch project documents for linking
  const { data: documents } = useQuery({
    queryKey: ["documents", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/documents`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.data as ProjectDocument[];
    },
    enabled: open,
  });

  const readyDocs = (documents ?? []).filter((d) => d.status === "READY");
  const hasGcEmail = !!projectInfo?.gcContactEmail;

  const createMutation = useMutation({
    mutationFn: async ({ andSend }: { andSend: boolean }) => {
      const body: Record<string, unknown> = {
        subject,
        question,
        priority,
      };
      if (dueDate) body.dueDate = new Date(dueDate).toISOString();
      if (selectedDocIds.length > 0) body.sourceDocIds = selectedDocIds;

      const res = await fetch(`/api/projects/${projectId}/rfis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create RFI");
      }

      const data = await res.json();

      // If user wants to send immediately, send the email
      if (andSend && data.data?.id) {
        const sendRes = await fetch(
          `/api/projects/${projectId}/rfis/${data.data.id}/send-email`,
          { method: "POST" }
        );
        if (!sendRes.ok) {
          const sendErr = await sendRes.json();
          throw new Error(sendErr.error || "RFI created but email failed to send");
        }
      }

      return { ...data, wasSent: andSend };
    },
    onSuccess: (data) => {
      toast.success(
        data.wasSent
          ? "RFI created and sent to GC"
          : "RFI created as draft"
      );
      onCreated();
      onOpenChange(false);
      resetForm();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const aiDraftMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/rfis/draft-preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject,
            question,
            priority,
            sourceDocIds: selectedDocIds,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate AI draft");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setAiDraft(data.data.draft);
      setEditingDraft(false);
      setDraftEditText("");
      toast.success("AI draft generated");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  function resetForm() {
    setSubject("");
    setQuestion("");
    setPriority("MEDIUM");
    setDueDate("");
    setSelectedDocIds([]);
    setShowDocPicker(false);
    setAiDraft(null);
    setEditingDraft(false);
    setDraftEditText("");
    setSendAfterCreate(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create RFI</DialogTitle>
          <DialogDescription>
            Create a new Request for Information. It will start as a Draft.
          </DialogDescription>
        </DialogHeader>

        {/* GC Contact Info */}
        {projectInfo && (projectInfo.gcCompanyName || projectInfo.gcContactName || projectInfo.gcContactEmail) && (
          <div className="rounded-md border border-border-card bg-brand-off-white/50 px-3 py-2 dark:bg-muted/30">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
              Sending To
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
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate({ andSend: false });
          }}
          className="flex flex-col gap-4 pt-2"
        >
          {/* Subject */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rfi-subject">Subject *</Label>
            <Input
              id="rfi-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Clarification on HVAC duct routing at Level 3"
              required
            />
          </div>

          {/* Question */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="rfi-question">Question *</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 gap-1 text-[11px] text-purple-600 hover:text-purple-700"
                onClick={() => aiDraftMutation.mutate()}
                disabled={aiDraftMutation.isPending || !subject.trim()}
              >
                {aiDraftMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                AI Draft
              </Button>
            </div>
            <textarea
              id="rfi-question"
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                if (aiDraft) setAiDraft(null);
              }}
              placeholder="Describe the information you need (or just fill in the subject and click AI Draft)..."
              required
              rows={4}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />

            {/* AI Draft preview / edit */}
            {aiDraft && (
              <div className="rounded-md border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-950/20">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-purple-600">
                    <Sparkles className="h-3 w-3" />
                    AI-Generated Draft
                  </span>
                  {!editingDraft && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px] text-purple-600 hover:text-purple-700"
                      onClick={() => {
                        setDraftEditText(aiDraft);
                        setEditingDraft(true);
                      }}
                    >
                      Edit
                    </Button>
                  )}
                </div>
                {editingDraft ? (
                  <div className="space-y-2">
                    <textarea
                      value={draftEditText}
                      onChange={(e) => setDraftEditText(e.target.value)}
                      rows={8}
                      className="w-full rounded-md border border-purple-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/30 dark:bg-background"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setQuestion(draftEditText);
                          setAiDraft(null);
                          setEditingDraft(false);
                          setDraftEditText("");
                        }}
                      >
                        Use Edited Draft
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-text-secondary"
                        onClick={() => {
                          setEditingDraft(false);
                          setDraftEditText("");
                        }}
                      >
                        Cancel Edit
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="prose prose-sm max-w-none text-text-primary prose-strong:text-text-primary prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5">
                      <Markdown remarkPlugins={[remarkGfm]}>{aiDraft}</Markdown>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setQuestion(aiDraft);
                          setAiDraft(null);
                        }}
                      >
                        Use This Draft
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-text-secondary"
                        onClick={() => setAiDraft(null)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Priority */}
          <div className="flex flex-col gap-1.5">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Due Date */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rfi-due">Due Date</Label>
            <Input
              id="rfi-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          {/* Document Linking */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Source Documents</Label>
              {readyDocs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowDocPicker(!showDocPicker)}
                  className="text-xs font-medium text-brand-orange hover:underline"
                >
                  {showDocPicker ? "Hide" : "Link Documents"}
                </button>
              )}
            </div>

            {/* Selected docs chips */}
            {selectedDocIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedDocIds.map((docId) => {
                  const doc = readyDocs.find((d) => d.id === docId);
                  return (
                    <span
                      key={docId}
                      className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                    >
                      <FileText className="h-3 w-3" />
                      {doc?.name ?? docId}
                      <button
                        type="button"
                        onClick={() => setSelectedDocIds((ids) => ids.filter((id) => id !== docId))}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Doc picker list */}
            {showDocPicker && (
              <div className="max-h-32 overflow-y-auto rounded-md border border-border-card">
                {readyDocs.map((doc) => {
                  const isSelected = selectedDocIds.includes(doc.id);
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => {
                        setSelectedDocIds((ids) =>
                          isSelected
                            ? ids.filter((id) => id !== doc.id)
                            : [...ids, doc.id]
                        );
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-brand-off-white dark:hover:bg-muted",
                        isSelected && "bg-blue-50 dark:bg-blue-950/30"
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          isSelected
                            ? "border-brand-orange bg-brand-orange text-white"
                            : "border-border-card"
                        )}
                      >
                        {isSelected && <span className="text-[10px]">✓</span>}
                      </div>
                      <FileText className="h-3 w-3 shrink-0 text-text-secondary" />
                      <span className="truncate text-text-primary">{doc.name}</span>
                      <Badge variant="outline" className="ml-auto shrink-0 text-[9px]">{doc.type}</Badge>
                    </button>
                  );
                })}
                {readyDocs.length === 0 && (
                  <p className="px-3 py-4 text-center text-xs text-text-secondary">
                    No documents available
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="outline"
              disabled={createMutation.isPending || !subject.trim() || !question.trim()}
            >
              {createMutation.isPending && !sendAfterCreate && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              Save as Draft
            </Button>
            <Button
              type="button"
              disabled={createMutation.isPending || !subject.trim() || !question.trim() || !hasGcEmail}
              title={!hasGcEmail ? "Add GC contact email in Project Settings first" : undefined}
              onClick={() => {
                setSendAfterCreate(true);
                createMutation.mutate({ andSend: true });
              }}
            >
              {createMutation.isPending && sendAfterCreate ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-1.5 h-4 w-4" />
              )}
              Create & Send
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── RFI Detail Dialog ──────────────────────────────────────── */

function RfiDetailDialog({
  projectId,
  rfi,
  onClose,
  onUpdated,
}: {
  projectId: string;
  rfi: RFI | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [editingStatus, setEditingStatus] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editQuestion, setEditQuestion] = useState("");
  const [responseText, setResponseText] = useState("");
  const [showResponseInput, setShowResponseInput] = useState(false);

  // Fetch project info for GC contact display
  const { data: projectInfo } = useQuery({
    queryKey: ["project-info", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data as ProjectInfo;
    },
    enabled: !!rfi,
  });

  // Fetch linked document names
  const { data: linkedDocs } = useQuery({
    queryKey: ["linked-docs", rfi?.id],
    queryFn: async () => {
      if (!rfi || rfi.sourceDocIds.length === 0) return [];
      const res = await fetch(`/api/projects/${projectId}/documents`);
      if (!res.ok) return [];
      const json = await res.json();
      const allDocs = json.data as ProjectDocument[];
      return allDocs.filter((d) => rfi.sourceDocIds.includes(d.id));
    },
    enabled: !!rfi && rfi.sourceDocIds.length > 0,
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      data,
      keepOpen,
    }: {
      data: Record<string, unknown>;
      keepOpen?: boolean;
    }) => {
      const res = await fetch(
        `/api/projects/${projectId}/rfis/${rfi!.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update RFI");
      }
      return { json: await res.json(), keepOpen };
    },
    onSuccess: ({ keepOpen }) => {
      toast.success("RFI updated");
      onUpdated();
      setEditingQuestion(false);
      setEditSubject("");
      setEditQuestion("");
      if (!keepOpen) onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/rfis/${rfi!.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete RFI");
      }
    },
    onSuccess: () => {
      toast.success("RFI deleted");
      onUpdated();
      onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const aiDraftMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/rfis/${rfi!.id}/ai-draft`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate AI draft");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success("AI draft generated");
      onUpdated();
      // Don't close — show the draft in the dialog
      if (rfi) {
        rfi.aiDraftQuestion = data.data.draft;
        rfi.aiDraftModel = data.data.model;
      }
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const analyzeResponseMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/rfis/${rfi!.id}/analyze-response`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to analyze response");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success("Response analyzed");
      onUpdated();
      if (rfi) {
        rfi.aiResponseAnalysis = data.data.analysis;
        if (data.data.coDetected) rfi.coFlag = true;
      }
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/projects/${projectId}/rfis/${rfi!.id}/send-email`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to send email");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("RFI email sent to GC contact");
      onUpdated();
      onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  if (!rfi) return null;

  return (
    <Dialog open={!!rfi} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-brand-orange">RFI-{rfi.rfiNumber}</span>
            <span className="text-text-primary">{rfi.subject}</span>
          </DialogTitle>
          <DialogDescription>
            Created {formatDate(rfi.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 pt-2">
          {/* Status + Priority badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium", STATUS_COLORS[rfi.status])}>
              {formatStatus(rfi.status)}
            </span>
            <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", PRIORITY_COLORS[rfi.priority])}>
              {rfi.priority}
            </span>
            {rfi.isOverdue && (
              <Badge variant="destructive" className="text-[10px]">OVERDUE</Badge>
            )}
            {rfi.coFlag && (
              <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">
                Change Order{rfi.coEstimate ? ` · $${Number(rfi.coEstimate).toLocaleString()}` : ""}
              </Badge>
            )}
            {rfi.dueDate && (
              <span className="flex items-center gap-1 text-xs text-text-secondary">
                <Clock className="h-3 w-3" />
                Due {formatDate(rfi.dueDate)}
              </span>
            )}
          </div>

          {/* GC Contact Info */}
          {projectInfo && (projectInfo.gcCompanyName || projectInfo.gcContactName || projectInfo.gcContactEmail) && (
            <div className="rounded-md border border-border-card bg-brand-off-white/50 px-3 py-2 dark:bg-muted/30">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                {rfi.status === "DRAFT" ? "Sending To" : "Sent To"}
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
            </div>
          )}

          {/* Linked Documents */}
          {linkedDocs && linkedDocs.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Linked Documents
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {linkedDocs.map((doc) => (
                  <span
                    key={doc.id}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                  >
                    <FileText className="h-3 w-3" />
                    {doc.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Question */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Question
              </h4>
              <div className="flex items-center gap-1">
                {(rfi.status === "DRAFT" || rfi.status === "SUBMITTED") && !editingQuestion && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 text-[11px] text-text-secondary hover:text-text-primary"
                    onClick={() => {
                      setEditSubject(rfi.subject);
                      setEditQuestion(rfi.question);
                      setEditingQuestion(true);
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </Button>
                )}
                {rfi.status === "DRAFT" && !editingQuestion && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 text-[11px] text-purple-600 hover:text-purple-700"
                    onClick={() => aiDraftMutation.mutate()}
                    disabled={aiDraftMutation.isPending}
                  >
                    {aiDraftMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    AI Draft
                  </Button>
                )}
              </div>
            </div>
            {editingQuestion ? (
              <div className="space-y-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-subject" className="text-xs">Subject</Label>
                  <Input
                    id="edit-subject"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-question" className="text-xs">Question</Label>
                  <textarea
                    id="edit-question"
                    value={editQuestion}
                    onChange={(e) => setEditQuestion(e.target.value)}
                    rows={6}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    disabled={
                      !editSubject.trim() ||
                      !editQuestion.trim() ||
                      (editSubject === rfi.subject && editQuestion === rfi.question) ||
                      updateMutation.isPending
                    }
                    onClick={() => {
                      const updates: Record<string, unknown> = {};
                      if (editSubject !== rfi.subject) updates.subject = editSubject;
                      if (editQuestion !== rfi.question) updates.question = editQuestion;
                      updateMutation.mutate({ data: updates, keepOpen: true });
                    }}
                  >
                    {updateMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    Save Changes
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setEditingQuestion(false);
                      setEditSubject("");
                      setEditQuestion("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap rounded-md border border-border-card bg-brand-off-white p-3 text-sm text-text-primary dark:bg-muted">
                {rfi.question}
              </p>
            )}
          </div>

          {/* AI Draft Question */}
          {rfi.aiDraftQuestion && (
            <div>
              <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-purple-600">
                <Sparkles className="h-3 w-3" />
                AI-Generated Draft
              </h4>
              <div className="rounded-md border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-950/20">
                <div className="prose prose-sm max-w-none text-text-primary prose-strong:text-text-primary prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5">
                  <Markdown remarkPlugins={[remarkGfm]}>{rfi.aiDraftQuestion}</Markdown>
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-[10px] text-text-secondary">
                  Generated by {rfi.aiDraftModel}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] text-brand-orange"
                  onClick={() => {
                    updateMutation.mutate({ data: { question: rfi.aiDraftQuestion }, keepOpen: true });
                  }}
                  disabled={updateMutation.isPending}
                >
                  Use as Question
                </Button>
              </div>
            </div>
          )}

          {/* Response */}
          {rfi.response ? (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Response
                </h4>
                {!rfi.aiResponseAnalysis && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 text-[11px] text-purple-600 hover:text-purple-700"
                    onClick={() => analyzeResponseMutation.mutate()}
                    disabled={analyzeResponseMutation.isPending}
                  >
                    {analyzeResponseMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Brain className="h-3 w-3" />
                    )}
                    Analyze Response
                  </Button>
                )}
              </div>
              <p className="whitespace-pre-wrap rounded-md border border-border-card bg-emerald-50 p-3 text-sm text-text-primary dark:bg-emerald-950/20">
                {rfi.response}
              </p>
              {rfi.respondedAt && (
                <p className="mt-1 text-[11px] text-text-secondary">
                  Responded {formatDate(rfi.respondedAt)}
                </p>
              )}
            </div>
          ) : (
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Response
              </h4>
              {showResponseInput ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    placeholder="Enter the response received..."
                    rows={3}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!responseText.trim() || updateMutation.isPending}
                      onClick={() => {
                        updateMutation.mutate({
                          data: { response: responseText, status: "ANSWERED" },
                        });
                      }}
                    >
                      {updateMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      Save Response
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setShowResponseInput(false);
                        setResponseText("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowResponseInput(true)}
                  className="w-full rounded-md border border-dashed border-border-card p-3 text-center text-xs text-text-secondary transition-colors hover:border-brand-orange hover:text-text-primary"
                >
                  + Add Response
                </button>
              )}
            </div>
          )}

          {/* AI Response Analysis */}
          {rfi.aiResponseAnalysis && (
            <div>
              <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-purple-600">
                <Brain className="h-3 w-3" />
                AI Response Analysis
              </h4>
              <div className="rounded-md border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-950/20">
                <div className="prose prose-sm max-w-none text-text-primary prose-strong:text-text-primary prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5">
                  <Markdown remarkPlugins={[remarkGfm]}>{rfi.aiResponseAnalysis}</Markdown>
                </div>
              </div>
            </div>
          )}

          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-2 border-t border-border-card pt-3">
            <span className="text-xs font-medium text-text-secondary">
              Status:
            </span>
            {editingStatus ? (
              <Select
                value={rfi.status}
                onValueChange={(v) => {
                  updateMutation.mutate({ data: { status: v } });
                  setEditingStatus(false);
                }}
              >
                <SelectTrigger className="h-7 w-[150px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{formatStatus(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setEditingStatus(true)}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                Change Status
              </Button>
            )}

            {/* Send Email */}
            {(rfi.status === "DRAFT" || rfi.status === "SUBMITTED") && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-blue-800 dark:hover:bg-blue-950/30"
                onClick={() => sendEmailMutation.mutate()}
                disabled={sendEmailMutation.isPending}
              >
                {sendEmailMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Mail className="h-3 w-3" />
                )}
                {rfi.status === "SUBMITTED" ? "Resend Email" : "Send Email"}
              </Button>
            )}

            {/* Delete */}
            <div className="ml-auto">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                onClick={() => {
                  if (confirm("Are you sure you want to delete this RFI? This cannot be undone.")) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                Delete
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
