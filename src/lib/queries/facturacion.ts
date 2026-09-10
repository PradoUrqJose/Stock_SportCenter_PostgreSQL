import { db, toPlain } from "@/lib/db";

// Las columnas que expone la app son las que trae el módulo VE/VEBREDI del ERP
// (ver api/sincronizar.py) y las únicas que tiene el histórico cargado por
// Excel: mayorista, minorista, comprobante, fecha, total y ser-num. El resto de
// columnas de la tabla `facturacion` sobrevive de la versión anterior del
// scraper (VE/BVENT) y está vacía en el 99% de las filas, así que no se lee.
export type FacturacionRow = {
  ser_num: string;
  mayorista: string | null;
  cliente: string | null;
  tipo_comprobante: string | null;
  fecha: string;
  total: number;
};

export async function fetchFacturacion(): Promise<FacturacionRow[]> {
  const result = await db.execute(
    `SELECT ser_num, mayorista, cliente, tipo_comprobante, fecha, total
     FROM facturacion
     ORDER BY fecha DESC`
  );

  return toPlain<FacturacionRow>(result.rows);
}
