import { Tags, Package } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { SidebarLink } from "@/components/admin/sidebar-link";
import { SidebarLogout } from "@/components/admin/sidebar-logout";

export function ClientSidebar({ session }: { session: SessionUser }) {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col bg-[#181d26]">
      <div className="border-b border-white/10 px-4 py-5">
        <p className="text-sm font-semibold text-white">Stock Sport Center</p>
        <p className="mt-0.5 text-xs text-white/40">{session.nombre}</p>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
        <SidebarLink
          href="/client/actualizacion"
          icon={<Tags className="h-4 w-4" />}
          label="Actualización"
        />
        <SidebarLink
          href="/client/productos"
          icon={<Package className="h-4 w-4" />}
          label="Productos"
        />
      </nav>

      <div className="border-t border-white/10 px-2 py-3">
        <SidebarLogout />
      </div>
    </aside>
  );
}
