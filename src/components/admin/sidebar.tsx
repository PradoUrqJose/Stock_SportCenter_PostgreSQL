import {
  LayoutDashboard,
  Package2,
  Tags,
  ClipboardList,
  Store,
  Users,
  KeyRound,
  ShieldCheck,
  PackageCheck,
  UploadCloud,
  BarChart3,
  TruckIcon,
  Receipt,
} from "lucide-react";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { SidebarLink } from "./sidebar-link";
import { SidebarLogout } from "./sidebar-logout";
import { ThemeToggle } from "@/components/ui/theme-toggle";

type Module = { id: string; nombre: string; ruta: string; orden: number };

const ICONS: Record<string, React.ReactNode> = {
  dashboard: <LayoutDashboard className="h-4 w-4" />,
  productos: <Package2 className="h-4 w-4" />,
  actualizacion: <Tags className="h-4 w-4" />,
  registro: <ClipboardList className="h-4 w-4" />,
  reposicion: <PackageCheck className="h-4 w-4" />,
  utils: <UploadCloud className="h-4 w-4" />,
  analisis: <BarChart3 className="h-4 w-4" />,
  ingresos: <TruckIcon className="h-4 w-4" />,
  facturacion: <Receipt className="h-4 w-4" />,
  tiendas: <Store className="h-4 w-4" />,
  usuarios: <Users className="h-4 w-4" />,
  credenciales: <KeyRound className="h-4 w-4" />,
  permisos: <ShieldCheck className="h-4 w-4" />,
};

const PERMISOS_MODULE: Module = {
  id: "permisos",
  nombre: "Permisos",
  ruta: "/admin/gestion/permisos",
  orden: 99,
};

async function fetchModules(session: SessionUser): Promise<Module[]> {
  if (session.rol === "administrador_general") {
    const r = await db.execute("SELECT id, nombre, ruta, orden FROM modules ORDER BY orden");
    const all = r.rows as unknown as Module[];
    return [...all, PERMISOS_MODULE];
  }

  const r = await db.execute({
    sql: `SELECT m.id, m.nombre, m.ruta, m.orden
          FROM modules m
          JOIN admin_modules am ON am.module_id = m.id
          WHERE am.user_id = ?
          ORDER BY m.orden`,
    args: [session.id],
  });
  return r.rows as unknown as Module[];
}

export async function AdminSidebar({ session }: { session: SessionUser }) {
  const modules = await fetchModules(session);

  const topModules = modules.filter((m) => !m.ruta.startsWith("/admin/gestion/"));
  const gestionModules = modules.filter((m) => m.ruta.startsWith("/admin/gestion/"));

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col bg-[#181d26]">
      <div className="border-b border-white/10 px-4 py-5">
        <p className="text-sm font-semibold text-white">Stock Sport Center</p>
        <p className="mt-0.5 text-xs text-white/40">{session.nombre}</p>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
        {topModules.map((m) => (
          <SidebarLink key={m.id} href={m.ruta} icon={ICONS[m.id]} label={m.nombre} />
        ))}

        {gestionModules.length > 0 && (
          <div className="mt-4">
            <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-white/30">
              Gestión
            </p>
            {gestionModules.map((m) => (
              <SidebarLink key={m.id} href={m.ruta} icon={ICONS[m.id]} label={m.nombre} />
            ))}
          </div>
        )}
      </nav>

      <div className="border-t border-white/10 px-2 py-3">
        <ThemeToggle />
        <SidebarLogout />
      </div>
    </aside>
  );
}
