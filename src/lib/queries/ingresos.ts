import { db, toPlain } from "@/lib/db";

export type IngresoRow = {
  codigo_interno: string;
  almacen: string | null;
  serie_numero: string | null;
  emision: string;
  moneda: string | null;
  subtotal: number | null;
  igv: number | null;
  dscto: number | null;
  total: number | null;
  ruc: string | null;
  proveedor: string | null;
  cmpl: string | null;
  mcdr: string | null;
  ord_compra: string | null;
};

// El histórico solo trae un monto único (columna `importe`), no el desglose
// subtotal/igv/total del scraper — COALESCE deja "Total" con el mejor monto
// disponible sin importar el origen de la fila.
export async function fetchIngresos(): Promise<IngresoRow[]> {
  const result = await db.execute(
    `SELECT codigo_interno, almacen, serie_numero, emision, moneda,
            subtotal, igv, dscto, COALESCE(total, importe) AS total,
            ruc, proveedor, cmpl, mcdr, ord_compra
     FROM ingresos
     ORDER BY codigo_interno`
  );
  return toPlain<IngresoRow>(result.rows);
}
