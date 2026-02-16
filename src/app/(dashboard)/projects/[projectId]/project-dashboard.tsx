"use client";

import Link from "next/link";
import { DocumentList } from "@/components/documents/document-list";
import {
  FileText,
  Search,
  Upload,
  MessageSquare,
  Activity,
  Building2,
  User,
  Mail,
  Phone,
  Ruler,
  HardHat,
  Landmark,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ProjectData {
  id: string;
  name: string;
  code: string;
  type: string;
  status: string;
  contractValue: number | null;
  documentsCount: number;
  readyDocuments: number;
  rfisCount: number;
  gcCompanyName: string | null;
  gcContactName: string | null;
  gcContactEmail: string | null;
  gcContactPhone: string | null;
  architectName: string | null;
  architectEmail: string | null;
  architectPhone: string | null;
  engineerName: string | null;
  engineerEmail: string | null;
  engineerPhone: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
}

interface ActivityItem {
  id: string;
  action: string;
  entityType: string;
  userName: string;
  createdAt: string;
}

export function ProjectDashboard({
  project,
  recentActivity,
}: {
  project: ProjectData;
  recentActivity: ActivityItem[];
}) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <div className="p-6">
      {/* Project header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-text-primary">
            {project.name}
          </h1>
          <Badge variant="outline">{project.code}</Badge>
          <Badge variant="secondary">{project.type}</Badge>
        </div>
        {project.contractValue && (
          <p className="mt-1 text-sm text-text-secondary">
            Contract Value: {formatCurrency(project.contractValue)}
          </p>
        )}
      </div>

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/50">
                <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-text-primary">
                  {project.documentsCount}
                </p>
                <p className="text-sm text-text-secondary">
                  Documents ({project.readyDocuments} ready)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/50">
                <MessageSquare className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-text-primary">
                  {project.rfisCount}
                </p>
                <p className="text-sm text-text-secondary">RFIs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-950/50">
                <Activity className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-text-primary">—</p>
                <p className="text-sm text-text-secondary">Health Score</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Project Contacts */}
      {(() => {
        const contacts = [
          {
            label: "General Contractor",
            icon: Building2,
            name: project.gcContactName,
            email: project.gcContactEmail,
            phone: project.gcContactPhone,
            company: project.gcCompanyName,
          },
          {
            label: "Architect",
            icon: Ruler,
            name: project.architectName,
            email: project.architectEmail,
            phone: project.architectPhone,
          },
          {
            label: "Engineer",
            icon: HardHat,
            name: project.engineerName,
            email: project.engineerEmail,
            phone: project.engineerPhone,
          },
          {
            label: "Owner",
            icon: Landmark,
            name: project.ownerName,
            email: project.ownerEmail,
            phone: project.ownerPhone,
          },
        ];
        const populated = contacts.filter(
          (c) => c.name || c.email || c.phone || ("company" in c && c.company)
        );
        if (populated.length === 0) return null;
        return (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Project Contacts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {populated.map((c) => {
                  const Icon = c.icon;
                  return (
                    <div key={c.label} className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-border-card">
                        <Icon className="h-4 w-4 text-text-secondary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                          {c.label}
                        </p>
                        {"company" in c && c.company && (
                          <p className="text-sm font-medium text-text-primary">{c.company}</p>
                        )}
                        {c.name && (
                          <p className="text-sm text-text-primary">{c.name}</p>
                        )}
                        {c.email && (
                          <a
                            href={`mailto:${c.email}`}
                            className="block truncate text-sm text-brand-orange hover:underline"
                          >
                            {c.email}
                          </a>
                        )}
                        {c.phone && (
                          <a
                            href={`tel:${c.phone}`}
                            className="text-sm text-brand-orange hover:underline"
                          >
                            {c.phone}
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Quick actions + recent activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Quick actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3">
            <Link
              href={`/projects/${project.id}/search`}
              className="flex items-center gap-3 rounded-lg border border-border-card p-4 transition-colors hover:border-brand-orange hover:bg-brand-orange/5"
            >
              <Search className="h-5 w-5 text-brand-orange" />
              <div>
                <p className="font-medium text-text-primary">
                  Search Documents
                </p>
                <p className="text-sm text-text-secondary">
                  AI-powered search across all project documents
                </p>
              </div>
            </Link>

            <Link
              href={`/projects/${project.id}/rfis`}
              className="flex items-center gap-3 rounded-lg border border-border-card p-4 transition-colors hover:border-brand-orange hover:bg-brand-orange/5"
            >
              <MessageSquare className="h-5 w-5 text-brand-orange" />
              <div>
                <p className="font-medium text-text-primary">Create RFI</p>
                <p className="text-sm text-text-secondary">
                  Draft a new Request for Information
                </p>
              </div>
            </Link>

            <button
              onClick={() => {
                // Will be connected to upload dialog
                document.dispatchEvent(new CustomEvent("open-upload-dialog"));
              }}
              className="flex items-center gap-3 rounded-lg border border-border-card p-4 text-left transition-colors hover:border-brand-orange hover:bg-brand-orange/5"
            >
              <Upload className="h-5 w-5 text-brand-orange" />
              <div>
                <p className="font-medium text-text-primary">
                  Upload Document
                </p>
                <p className="text-sm text-text-secondary">
                  Add specs, drawings, contracts, and more
                </p>
              </div>
            </button>
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-secondary">
                No activity yet
              </p>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 border-b border-border-card pb-3 last:border-0 last:pb-0"
                  >
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-border-card">
                      <Activity className="h-3 w-3 text-text-secondary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text-primary">
                        <span className="font-medium">{item.userName}</span>{" "}
                        {item.action.toLowerCase()} {item.entityType}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {formatDate(item.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Document list */}
      <div className="mt-6">
        <DocumentList projectId={project.id} />
      </div>
    </div>
  );
}
