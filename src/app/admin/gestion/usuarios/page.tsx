import { requireRole, requireModule } from "@/lib/auth";
import { db, toPlain } from "@/lib/db";
import { UsuariosTable } from "@/components/admin/gestion/usuarios-table";
import type { Tienda, UserRow } from "@/types";

export default async function UsuariosPage() {
  const session = await requireRole("admin", "administrador_general");
  await requireModule(session, "usuarios");

  const [usersResult, tiendasResult] = await Promise.all([
    db.execute(`
      SELECT u.id, u.username, u.nombre, u.rol, u.tienda_id,
             t.nombre AS tienda_nombre, u.activo, u.created_at
      FROM users u
      LEFT JOIN tiendas t ON t.id = u.tienda_id
      ORDER BY u.created_at DESC
    `),
    db.execute("SELECT id, nombre, excluida_actualizacion, created_at FROM tiendas ORDER BY nombre"),
  ]);

  const usuarios = toPlain<UserRow>(usersResult.rows);
  const tiendas = toPlain<Tienda>(tiendasResult.rows);

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-[#181d26]">Usuarios</h1>
      <p className="mt-1 mb-6 text-sm text-[#41454d]">
        Crea usuarios con rol Admin o Cliente. El Administrador General se configura por variable de entorno.
      </p>
      <UsuariosTable usuarios={usuarios} tiendas={tiendas} />
    </div>
  );
}
