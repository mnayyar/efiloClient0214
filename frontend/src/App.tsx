import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { AuthGuard } from "@/components/auth-guard";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { LoginPage } from "@/pages/login";
import { CallbackPage } from "@/pages/callback";
import { LogoutPage } from "@/pages/logout";
import { ProjectsPage } from "@/pages/projects";
import { SearchPage } from "@/pages/project/search";
import { RfisPage } from "@/pages/project/rfis";
import { CompliancePage } from "@/pages/project/compliance";
import { HealthPage } from "@/pages/project/health";
import { ChangesPage } from "@/pages/project/changes";
import { MeetingsPage } from "@/pages/project/meetings";
import { CloseoutPage } from "@/pages/project/closeout";
import { ProjectSetupPage } from "@/pages/project-setup";
import { SettingsPage } from "@/pages/settings";
import { OrganizationSettingsPage } from "@/pages/settings/organization";
import { UsersSettingsPage } from "@/pages/settings/users";
import { EnterprisePage } from "@/pages/enterprise";

const router = createBrowserRouter([
  // Public routes
  { path: "/login", element: <LoginPage /> },
  { path: "/callback", element: <CallbackPage /> },
  { path: "/logout", element: <LogoutPage /> },

  // Protected routes — wrapped in AuthGuard + DashboardShell
  {
    path: "/",
    element: (
      <AuthGuard>
        <DashboardShell />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      { path: "projects", element: <ProjectsPage /> },

      // Project landing — redirect to search
      {
        path: "projects/:projectId",
        element: <Navigate to="search" replace />,
      },

      // Project agent routes
      { path: "projects/:projectId/search", element: <SearchPage /> },
      { path: "projects/:projectId/rfis", element: <RfisPage /> },
      { path: "projects/:projectId/compliance", element: <CompliancePage /> },
      { path: "projects/:projectId/health", element: <HealthPage /> },
      { path: "projects/:projectId/changes", element: <ChangesPage /> },
      { path: "projects/:projectId/meetings", element: <MeetingsPage /> },
      { path: "projects/:projectId/closeout", element: <CloseoutPage /> },

      // Other dashboard routes
      { path: "project-setup", element: <ProjectSetupPage /> },
      { path: "enterprise", element: <EnterprisePage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "settings/organization", element: <OrganizationSettingsPage /> },
      { path: "settings/users", element: <UsersSettingsPage /> },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
