import { requireRole } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/sidebar";
import { SidebarShell } from "@/components/ui/sidebar-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("admin", "administrador_general");
  return (
    <SidebarShell sidebar={<AdminSidebar session={session} />}>
      {children}
    </SidebarShell>
  );
}
