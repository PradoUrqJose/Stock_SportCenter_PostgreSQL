import { db, toPlain } from "@/lib/db";

export type ReponerRow = {
  cod_universal: string;
  generos: string;
  marca: string | null;
  modelo: string | null;
  categoria: string | null;
  color: string | null;
  precio_lista: number | null;
  descuento: number;
  stock_total: number;
  almacenes: string;
  ingreso_mas_antiguo: string | null;
  antiguedad_dias: number | null;
};

/**
 * Productos cuyas unidades actuales están exclusivamente en los almacenes
 * centrales. No hay historial: el aviso representa el último stock cargado.
 *
 * Se agrupa por código universal para que un producto con varios géneros solo
 * aparezca si NINGUNA de sus variantes está ya en una tienda.
 */
export async function fetchParaReponer(): Promise<ReponerRow[]> {
  const r = await db.execute(`
    WITH solo_almacen AS (
      SELECT v.cod_universal,
             COUNT(*)::integer AS stock_total,
             MIN(v.ingreso_fecha) AS ingreso_mas_antiguo
      FROM variantes v
      GROUP BY v.cod_universal
      HAVING BOOL_OR(v.alm_izq IN ('JAL1', 'JAL4') OR v.alm_der IN ('JAL1', 'JAL4'))
         AND BOOL_AND(
           (v.alm_izq IS NULL OR v.alm_izq = '' OR v.alm_izq IN ('JAL1', 'JAL4'))
           AND (v.alm_der IS NULL OR v.alm_der = '' OR v.alm_der IN ('JAL1', 'JAL4'))
         )
    ), ubicaciones AS (
      SELECT v.cod_universal,
             STRING_AGG(DISTINCT u.almacen, ', ' ORDER BY u.almacen) AS almacenes
      FROM variantes v
      CROSS JOIN LATERAL (VALUES (v.alm_izq), (v.alm_der)) AS u(almacen)
      WHERE u.almacen IN ('JAL1', 'JAL4')
      GROUP BY v.cod_universal
    )
    SELECT s.cod_universal,
           STRING_AGG(DISTINCT p.genero, ', ' ORDER BY p.genero) AS generos,
           MIN(p.marca) AS marca,
           MIN(p.modelo) AS modelo,
           MIN(p.categoria) AS categoria,
           MIN(p.color) AS color,
           MIN(p.precio_lista) AS precio_lista,
           MAX(p.descuento) AS descuento,
           s.stock_total,
           u.almacenes,
           s.ingreso_mas_antiguo,
           CASE
             WHEN s.ingreso_mas_antiguo IS NULL THEN NULL
             ELSE (CURRENT_DATE - s.ingreso_mas_antiguo::date)::integer
           END AS antiguedad_dias
    FROM solo_almacen s
    JOIN productos p ON p.cod_universal = s.cod_universal
    JOIN ubicaciones u ON u.cod_universal = s.cod_universal
    GROUP BY s.cod_universal, s.stock_total, s.ingreso_mas_antiguo, u.almacenes
    ORDER BY s.stock_total DESC, marca NULLS LAST, modelo NULLS LAST
  `);
  return toPlain<ReponerRow>(r.rows);
}
