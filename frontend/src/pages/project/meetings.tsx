import {
  Users,
  ListChecks,
  Calendar,
  FileText,
  Bot,
  Repeat,
} from "lucide-react";

const FEATURES = [
  {
    icon: FileText,
    title: "Meeting Minutes",
    desc: "Structured meeting notes with auto-generated summaries and action items",
  },
  {
    icon: ListChecks,
    title: "Action Items",
    desc: "Track action items with assignments, due dates, and completion status",
  },
  {
    icon: Calendar,
    title: "Scheduling",
    desc: "Manage recurring and one-off meetings with calendar integration",
  },
  {
    icon: Bot,
    title: "AI Summaries",
    desc: "AI-generated meeting summaries, decisions, and follow-up reminders",
  },
  {
    icon: Users,
    title: "Attendee Tracking",
    desc: "Track attendance, roles, and participation across meetings",
  },
  {
    icon: Repeat,
    title: "Workflow Automation",
    desc: "Auto-distribute minutes and trigger follow-up workflows",
  },
];

export function MeetingsPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 shadow-lg shadow-blue-500/20">
        <Users className="h-8 w-8 text-white" />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-text-primary">
        Meeting &amp; Workflow
      </h2>
      <p className="mt-1.5 max-w-md text-center text-sm text-text-secondary">
        Meeting minutes, action items, and workflow automation. Coming in a
        future release.
      </p>

      <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="flex flex-col items-center rounded-lg border border-border-card bg-brand-off-white/50 px-4 py-5 text-center"
          >
            <f.icon className="h-5 w-5 text-blue-600" />
            <p className="mt-2.5 text-xs font-semibold text-text-primary">
              {f.title}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
              {f.desc}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-full bg-blue-50 px-4 py-1.5 text-xs font-medium text-blue-700">
        Capability 6 &middot; Coming Soon
      </div>
    </div>
  );
}
