"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderOpen,
  Search,
  BarChart3,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeProjectId?: string;
}

const NAV_ITEMS = [
  { href: "/projects", label: "Projects", icon: FolderOpen },
  { href: "/enterprise", label: "Enterprise", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ collapsed, onToggle, activeProjectId }: SidebarProps) {
  const pathname = usePathname();

  const navItems = activeProjectId
    ? [
        NAV_ITEMS[0],
        {
          href: `/projects/${activeProjectId}/search`,
          label: "Ask",
          icon: Search,
        },
        ...NAV_ITEMS.slice(1),
      ]
    : NAV_ITEMS;

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border-card bg-brand-off-white transition-all duration-200",
        collapsed ? "w-20" : "w-[280px]"
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center justify-between border-b border-border-card px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-brand-orange">
            <span className="text-sm font-bold text-white">e</span>
          </div>
          {!collapsed && (
            <span className="text-lg font-semibold text-text-primary">
              efilo.ai
            </span>
          )}
        </div>
        <button
          onClick={onToggle}
          className="rounded-md p-1 text-text-secondary transition-colors hover:text-text-primary"
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-brand-orange/10 font-medium text-brand-orange"
                  : "text-text-secondary hover:bg-border-card hover:text-text-primary",
                collapsed && "justify-center px-0"
              )}
              title={collapsed ? item.label : undefined}
            >
              {isActive && (
                <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-brand-orange" />
              )}
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}
