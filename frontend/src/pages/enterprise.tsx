import {
  Building,
  BarChart3,
  TrendingUp,
  Globe,
  PieChart,
  Zap,
} from "lucide-react";

const FEATURES = [
  {
    icon: BarChart3,
    title: "Cross-Project Analytics",
    desc: "Compare metrics, costs, and timelines across all active projects",
  },
  {
    icon: TrendingUp,
    title: "Portfolio Trends",
    desc: "Identify organization-wide patterns in compliance, risk, and performance",
  },
  {
    icon: PieChart,
    title: "Resource Utilization",
    desc: "Track workforce allocation and utilization rates across projects",
  },
  {
    icon: Globe,
    title: "Geographic Overview",
    desc: "Visual map of project locations with status and health indicators",
  },
  {
    icon: Zap,
    title: "AI Insights",
    desc: "AI-powered recommendations based on aggregated project data",
  },
  {
    icon: Building,
    title: "Executive Dashboard",
    desc: "High-level KPIs and summaries for executive reporting",
  },
];

export function EnterprisePage() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-400 to-violet-600 shadow-lg shadow-indigo-500/20">
        <Building className="h-8 w-8 text-white" />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-text-primary">
        Enterprise Intelligence
      </h2>
      <p className="mt-1.5 max-w-md text-center text-sm text-text-secondary">
        Cross-project analytics, portfolio insights, and enterprise-wide
        reporting. Coming in a future release.
      </p>

      <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="flex flex-col items-center rounded-lg border border-border-card bg-brand-off-white/50 px-4 py-5 text-center"
          >
            <f.icon className="h-5 w-5 text-indigo-600" />
            <p className="mt-2.5 text-xs font-semibold text-text-primary">
              {f.title}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
              {f.desc}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-full bg-indigo-50 px-4 py-1.5 text-xs font-medium text-indigo-700">
        Capability 7 &middot; Coming Soon
      </div>
    </div>
  );
}
