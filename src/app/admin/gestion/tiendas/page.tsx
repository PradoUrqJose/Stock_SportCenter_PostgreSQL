import { requireRole, requireModule } from "@/lib/auth";
import { db, toPlain } from "@/lib/db";
import { TiendasTable } from "@/components/admin/gestion/tiendas-table";
import type { Tienda } from "@/types";

type LoteBorrador = { id: number };

export default async function TiendasPage() {
  const session = await requireRole("admin", "administrador_general");
  await requireModule(session, "tiendas");

  const [tiendasResult, loteResult] = await Promise.all([
    db.execute("SELECT id, nombre, excluida_actualizacion, created_at FROM tiendas ORDER BY nombre"),
    db.execute(
      `SELECT id FROM lotes WHERE estado = 'borrador' ORDER BY id DESC LIMIT 1`
    ),
  ]);

  const tiendas = toPlain<Tienda>(tiendasResult.rows);
  const loteBorrador: LoteBorrador | null =
    loteResult.rows.length > 0
      ? toPlain<LoteBorrador>(loteResult.rows)[0]
      : null;

  let exclusionesLote = new Set<string>();
  if (loteBorrador) {
    const excResult = await db.execute({
      sql: `SELECT tienda_id FROM lote_exclusiones WHERE lote_id = ?`,
      args: [loteBorrador.id],
    });
    exclusionesLote = new Set(excResult.rows.map((r) => r.tienda_id as string));
  }

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-xl font-semibold text-foreground">Tiendas</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Gestión de tiendas. El nombre debe coincidir exactamente con el código de almacén del ERP.
      </p>
      <TiendasTable
        tiendas={tiendas}
        loteBorrador={loteBorrador}
        exclusionesLote={[...exclusionesLote]}
      />
    </div>
  );
}
