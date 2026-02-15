import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getUserById } from "@/lib/workos";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const user = await getUserById(session.userId);
  if (!user) {
    redirect("/login");
  }

  return (
    <DashboardShell
      user={{ id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar }}
    >
      {children}
    </DashboardShell>
  );
}
