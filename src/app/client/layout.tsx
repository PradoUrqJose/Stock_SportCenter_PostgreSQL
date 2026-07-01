import { requireRole } from "@/lib/auth";
import { ClientSidebar } from "@/components/client/sidebar";
import { SidebarShell } from "@/components/ui/sidebar-shell";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("client");
  return (
    <SidebarShell sidebar={<ClientSidebar session={session} />}>
      {children}
    </SidebarShell>
  );
}
