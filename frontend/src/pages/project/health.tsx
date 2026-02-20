import {
  HeartPulse,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  Shield,
  Thermometer,
} from "lucide-react";

const FEATURES = [
  {
    icon: HeartPulse,
    title: "Health Score",
    desc: "Real-time composite score based on cost, schedule, quality, and safety metrics",
  },
  {
    icon: TrendingUp,
    title: "Trend Analysis",
    desc: "Track health over time with historical scoring and trend detection",
  },
  {
    icon: AlertTriangle,
    title: "Risk Alerts",
    desc: "Automatic alerts when health indicators fall below thresholds",
  },
  {
    icon: BarChart3,
    title: "KPI Dashboard",
    desc: "Visual breakdown of all contributing health dimensions",
  },
  {
    icon: Shield,
    title: "Compliance Integration",
    desc: "Compliance score feeds into overall project health assessment",
  },
  {
    icon: Thermometer,
    title: "Heat Map",
    desc: "At-a-glance heat map across all project health dimensions",
  },
];

export function HealthPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-lg shadow-emerald-500/20">
        <HeartPulse className="h-8 w-8 text-white" />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-text-primary">
        Project Health
      </h2>
      <p className="mt-1.5 max-w-md text-center text-sm text-text-secondary">
        Real-time project health scoring, risk assessment, and trend analysis.
        Coming in a future release.
      </p>

      <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="flex flex-col items-center rounded-lg border border-border-card bg-brand-off-white/50 px-4 py-5 text-center"
          >
            <f.icon className="h-5 w-5 text-emerald-600" />
            <p className="mt-2.5 text-xs font-semibold text-text-primary">
              {f.title}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
              {f.desc}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-full bg-emerald-50 px-4 py-1.5 text-xs font-medium text-emerald-700">
        Capability 4 &middot; Coming Soon
      </div>
    </div>
  );
}
