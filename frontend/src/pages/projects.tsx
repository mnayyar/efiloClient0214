export function ProjectsPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      {/* Hero */}
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-orange">
          <span className="text-2xl font-bold text-white">e</span>
        </div>
        <h1 className="text-3xl font-bold text-text-primary">
          Your Projects. Finally Connected.
        </h1>
        <p className="max-w-lg text-text-secondary">
          Select an AI Agent from the sidebar to get started, or go to{" "}
          <a href="/project-setup" className="text-brand-orange underline">
            Project Setup
          </a>{" "}
          to configure your project.
        </p>
      </div>

      {/* Stats */}
      <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { value: "5.5+", label: "Hours lost daily to disconnected data" },
          { value: "95.5%", label: "Project data unused or inaccessible" },
          { value: "6-10", label: "Disconnected tools per project" },
          { value: "6-10", label: "Day RFI response cycle" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border-card bg-card p-4 text-center"
          >
            <p className="text-2xl font-bold text-brand-orange">{stat.value}</p>
            <p className="mt-1 text-xs text-text-secondary">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
