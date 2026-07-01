import { requireRole } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("admin", "administrador_general");
  return (
    <div className="flex h-screen">
      <AdminSidebar session={session} />
      <main className="flex-1 overflow-auto bg-[#f8fafc]">{children}</main>
    </div>
  );
}
