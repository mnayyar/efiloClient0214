"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Organization", href: "/settings/organization" },
  { label: "Users", href: "/settings/users" },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary mb-4">Settings</h1>
      <div className="flex gap-6 border-b border-card-border mb-6">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`pb-2 text-sm font-medium transition-colors ${
                active
                  ? "border-b-2 border-brand text-text-primary"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
