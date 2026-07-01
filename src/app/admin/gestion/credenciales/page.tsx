import { requireRole, requireModule } from "@/lib/auth";
import { db, toPlain } from "@/lib/db";
import { CredencialesTable } from "@/components/admin/gestion/credenciales-table";
import type { Tienda, Vendedor } from "@/types";

export default async function CredencialesPage() {
  const session = await requireRole("admin", "administrador_general");
  await requireModule(session, "credenciales");

  const [vendResult, tiendasResult] = await Promise.all([
    db.execute(`
      SELECT v.id, v.nombre, v.codigo, v.tienda_id,
             t.nombre AS tienda_nombre, v.activo, v.created_at
      FROM vendedores v
      JOIN tiendas t ON t.id = v.tienda_id
      ORDER BY t.nombre, v.codigo
    `),
    db.execute("SELECT id, nombre, excluida_actualizacion, created_at FROM tiendas ORDER BY nombre"),
  ]);

  const vendedores = toPlain<Vendedor>(vendResult.rows);
  const tiendas = toPlain<Tienda>(tiendasResult.rows);

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-[#181d26]">Credenciales de Vendedores</h1>
      <p className="mt-1 mb-6 text-sm text-[#41454d]">
        Códigos que los vendedores usan para confirmar o rechazar actualizaciones de precios.
      </p>
      <CredencialesTable vendedores={vendedores} tiendas={tiendas} />
    </div>
  );
}
