import { db, toPlain } from "@/lib/db";

export type FacturacionRow = {
  ser_num: string;
  codigo: string | null;
  tienda: string | null;
  tipo_comprobante: string | null;
  cliente: string | null;
  mayorista: string | null;
  fecha: string;
  moneda: string | null;
  subtotal: number | null;
  dscto: number | null;
  not_cre: number | null;
  bi: number | null;
  igv: number | null;
  total: number;
  efectivo: number | null;
  tarjeta: number | null;
  transferencia: number | null;
  detalle_tarjeta: string | null;
  vendedor: string | null;
  nc: string | null;
};

export async function fetchFacturacion(): Promise<FacturacionRow[]> {
  const result = await db.execute(
    `SELECT ser_num, codigo, tienda, tipo_comprobante, cliente, mayorista, fecha, moneda,
            subtotal, dscto, not_cre, bi, igv, total,
            efectivo, tarjeta, transferencia, detalle_tarjeta, vendedor, nc
     FROM facturacion
     ORDER BY fecha DESC`
  );

  return toPlain<FacturacionRow>(result.rows);
}
