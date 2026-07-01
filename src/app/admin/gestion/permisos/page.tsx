import { requireRole } from "@/lib/auth";
import { db, toPlain } from "@/lib/db";
import { PermisosTable } from "@/components/admin/gestion/permisos-table";
import type { Module, UserRow } from "@/types";

export default async function PermisosPage() {
  await requireRole("administrador_general");

  const [adminsResult, modulesResult, grantsResult] = await Promise.all([
    db.execute(`
      SELECT id, username, nombre, rol, tienda_id, activo, created_at
      FROM users WHERE rol = 'admin' ORDER BY nombre
    `),
    db.execute("SELECT id, nombre, ruta, orden FROM modules ORDER BY orden"),
    db.execute("SELECT user_id, module_id FROM admin_modules"),
  ]);

  const admins = toPlain<UserRow>(adminsResult.rows);
  const modules = toPlain<Module>(modulesResult.rows);
  const grants = new Set<string>(
    toPlain<{ user_id: string; module_id: string }>(grantsResult.rows).map(
      (r) => `${r.user_id}:${r.module_id}`
    )
  );

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-xl font-semibold text-foreground">Permisos de Módulos</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Controla qué módulos puede ver cada usuario con rol Admin. El Administrador General siempre tiene acceso total.
      </p>
      <PermisosTable admins={admins} modules={modules} grants={grants} />
    </div>
  );
}
