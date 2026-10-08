import { Tags, Package, ArrowLeftRight } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SidebarLink } from "@/components/admin/sidebar-link";
import { SidebarLogout } from "@/components/admin/sidebar-logout";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export async function ClientSidebar({ session }: { session: SessionUser }) {
  const pending = session.tienda_id ? await db.execute({ sql: `SELECT COUNT(*) AS n FROM traslados x JOIN tiendas t ON t.id=?
    WHERE EXISTS (SELECT 1 FROM traslado_partes p WHERE p.traslado_id=x.id
      AND ((p.estado='solicitado' AND p.origen=t.nombre) OR (p.estado='enviado' AND x.destino=t.nombre)))`, args: [session.tienda_id] }) : null;
  const count = Number(pending?.rows[0]?.n ?? 0);
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
        <SidebarLink href="/client/stock" icon={<Package className="h-4 w-4" />} label="Stock completo" />
        <SidebarLink href="/client/traslados" icon={<ArrowLeftRight className="h-4 w-4" />} label={`Solicitudes y envíos${count ? ` (${count})` : ""}`} />
      </nav>

      <div className="border-t border-white/10 px-2 py-3">
        <ThemeToggle />
        <SidebarLogout />
      </div>
    </aside>
  );
}
