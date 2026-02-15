"use client";

import Link from "next/link";
import { DocumentList } from "@/components/documents/document-list";
import {
  FileText,
  Search,
  Upload,
  MessageSquare,
  Activity,
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
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <FileText className="h-5 w-5 text-blue-600" />
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
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                <MessageSquare className="h-5 w-5 text-amber-600" />
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
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                <Activity className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-text-primary">—</p>
                <p className="text-sm text-text-secondary">Health Score</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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
