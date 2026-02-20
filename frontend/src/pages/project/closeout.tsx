import {
  PackageCheck,
  ClipboardCheck,
  FileArchive,
  DollarSign,
  Calendar,
  CheckSquare,
} from "lucide-react";

const FEATURES = [
  {
    icon: ClipboardCheck,
    title: "Punch Lists",
    desc: "Manage and track project punch list items through to completion",
  },
  {
    icon: FileArchive,
    title: "Document Assembly",
    desc: "Automatically assemble closeout document packages for handover",
  },
  {
    icon: DollarSign,
    title: "Retention Tracking",
    desc: "Monitor retention amounts, release schedules, and payment milestones",
  },
  {
    icon: Calendar,
    title: "Warranty Tracking",
    desc: "Track warranty periods, start dates, and expiration reminders",
  },
  {
    icon: CheckSquare,
    title: "Completion Checklist",
    desc: "Custom checklists ensuring all closeout requirements are met",
  },
  {
    icon: PackageCheck,
    title: "Final Delivery",
    desc: "Coordinate final inspections, certificates, and project handover",
  },
];

export function CloseoutPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 shadow-lg shadow-orange-500/20">
        <PackageCheck className="h-8 w-8 text-white" />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-text-primary">
        Closeout &amp; Retention
      </h2>
      <p className="mt-1.5 max-w-md text-center text-sm text-text-secondary">
        Project closeout tracking, retention management, and final delivery
        coordination. Coming in a future release.
      </p>

      <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="flex flex-col items-center rounded-lg border border-border-card bg-brand-off-white/50 px-4 py-5 text-center"
          >
            <f.icon className="h-5 w-5 text-orange-600" />
            <p className="mt-2.5 text-xs font-semibold text-text-primary">
              {f.title}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
              {f.desc}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-full bg-orange-50 px-4 py-1.5 text-xs font-medium text-orange-700">
        Capability 8 &middot; Coming Soon
      </div>
    </div>
  );
}
