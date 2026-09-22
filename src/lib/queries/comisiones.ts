import { db, toPlain } from "@/lib/db";
import { DESCUENTOS_COMISION, type DescuentoComision } from "@/lib/comisiones";

export type PromocionUsuarioRow = { usuario: string; total_general: number } & Record<`d${DescuentoComision}`, number>;
export type TotalUsuarioRow = { usuario: string; cantidad: number; monto: number };

export async function promocionesPorUsuario(inicio: string, fin: string): Promise<PromocionUsuarioRow[]> {
  const columnas = DESCUENTOS_COMISION.map((descuento) => `COUNT(*) FILTER (WHERE promocion_aplicada = ${descuento})::integer AS d${descuento}`).join(", ");
  const r = await db.execute({ sql: `SELECT COALESCE(usuario, 'SIN USUARIO') AS usuario, ${columnas}, COUNT(*)::integer AS total_general FROM comisiones_ventas WHERE fecha_venta BETWEEN ? AND ? AND comprobante_serie IS DISTINCT FROM 'FJ01' AND promocion_aplicada IS NOT NULL AND (grupo IN ('CHIMPUNES','SANDALIAS','ZAPATILLAS') OR precio_venta > 100) GROUP BY COALESCE(usuario, 'SIN USUARIO') ORDER BY total_general DESC, usuario`, args: [inicio, fin] });
  return toPlain<PromocionUsuarioRow>(r.rows);
}
export async function totalesPorUsuario(inicio: string, fin: string): Promise<TotalUsuarioRow[]> {
  const r = await db.execute({ sql: `SELECT COALESCE(usuario, 'SIN USUARIO') AS usuario, COUNT(*)::integer AS cantidad, SUM(precio_venta) AS monto FROM comisiones_ventas WHERE fecha_venta BETWEEN ? AND ? AND comprobante_serie IS DISTINCT FROM 'FJ01' GROUP BY COALESCE(usuario, 'SIN USUARIO') ORDER BY monto DESC`, args: [inicio, fin] });
  return toPlain<TotalUsuarioRow>(r.rows);
}
