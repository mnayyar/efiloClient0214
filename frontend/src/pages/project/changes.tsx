import {
  GitBranch,
  DollarSign,
  FileText,
  Clock,
  TrendingUp,
  Layers,
} from "lucide-react";

const FEATURES = [
  {
    icon: GitBranch,
    title: "Change Tracking",
    desc: "Track change orders, proposals, and directives throughout the project lifecycle",
  },
  {
    icon: DollarSign,
    title: "Cost Impact",
    desc: "Quantify financial impact of each change with running cost summaries",
  },
  {
    icon: Clock,
    title: "Schedule Impact",
    desc: "Assess and track time extensions associated with changes",
  },
  {
    icon: FileText,
    title: "Documentation",
    desc: "Maintain a complete paper trail linking changes to source documents",
  },
  {
    icon: TrendingUp,
    title: "Trend Analytics",
    desc: "Identify patterns in changes by type, source, and impact area",
  },
  {
    icon: Layers,
    title: "RFI Integration",
    desc: "Link RFIs that spawn change orders for full traceability",
  },
];

export function ChangesPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-400 to-indigo-600 shadow-lg shadow-purple-500/20">
        <GitBranch className="h-8 w-8 text-white" />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-text-primary">
        Change Intelligence
      </h2>
      <p className="mt-1.5 max-w-md text-center text-sm text-text-secondary">
        Track change orders, quantify impacts, and maintain full audit trails.
        Coming in a future release.
      </p>

      <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="flex flex-col items-center rounded-lg border border-border-card bg-brand-off-white/50 px-4 py-5 text-center"
          >
            <f.icon className="h-5 w-5 text-purple-600" />
            <p className="mt-2.5 text-xs font-semibold text-text-primary">
              {f.title}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
              {f.desc}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-full bg-purple-50 px-4 py-1.5 text-xs font-medium text-purple-700">
        Capability 5 &middot; Coming Soon
      </div>
    </div>
  );
}
