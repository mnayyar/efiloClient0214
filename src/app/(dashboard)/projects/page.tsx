import Image from "next/image";
import { Search, FileText, ShieldCheck, Activity } from "lucide-react";

const STATS = [
  { value: "5.5+", label: "hours lost weekly searching for documents", icon: Search },
  { value: "95.5%", label: "of project data generated goes unused", icon: FileText },
  { value: "6-10", label: "different tools creating data silos per team", icon: ShieldCheck },
  { value: "6-10", label: "days average RFI cycle, delaying projects", icon: Activity },
];

export default function ProjectsPage() {
  return (
    <div className="mx-auto max-w-5xl p-6">
      {/* Hero Section */}
      <div className="flex flex-col items-center py-10 text-center">
        <Image
          src="/logo.svg"
          alt="efilo.ai"
          width={64}
          height={64}
          className="dark:brightness-200"
        />
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
          Your Projects. Finally Connected.
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-text-secondary">
          AI-powered project intelligence for construction contractors. Search,
          chat, and automate across all your project data.
        </p>
        <p className="mt-2 max-w-xl text-sm text-text-secondary">
          Select an agent from the sidebar to get started, or go to Project Setup
          to configure your projects.
        </p>
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col items-center rounded-xl border border-border-card bg-card p-4 text-center"
          >
            <stat.icon className="h-5 w-5 text-brand-orange" />
            <p className="mt-2 text-2xl font-bold text-text-primary">
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-text-secondary">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
