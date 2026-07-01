import { requireRole } from "@/lib/auth";
import { ClientSidebar } from "@/components/client/sidebar";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("client");
  return (
    <div className="flex h-screen">
      <ClientSidebar session={session} />
      <main className="flex-1 overflow-auto bg-[#f8fafc]">{children}</main>
    </div>
  );
}
