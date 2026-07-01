import { db, toPlain } from "@/lib/db";

export type UnicoRow = {
  cod_universal: string;
  genero: string;
  marca: string | null;
  modelo: string | null;
  categoria: string | null;
  color: string | null;
  talla: string | null;
  alm_izq: string | null;
  alm_der: string | null;
  precio_lista: number;
  descuento: number;
  ingreso_fecha: string | null;
  antiguedad_dias: number | null;
};

// Productos con una sola unidad en stock (un único código de barras / variante).
export async function fetchUnicos(): Promise<UnicoRow[]> {
  const r = await db.execute(`
    WITH u AS (
      SELECT cod_universal, genero
      FROM variantes
      GROUP BY cod_universal, genero
      HAVING COUNT(*) = 1
    )
    SELECT p.cod_universal, p.genero, p.marca, p.modelo, p.categoria, p.color,
      p.precio_lista, p.descuento,
      v.talla, v.alm_izq, v.alm_der, v.ingreso_fecha,
      CAST(ROUND(julianday('now') - julianday(v.ingreso_fecha)) AS INTEGER) AS antiguedad_dias
    FROM u
    JOIN productos p ON p.cod_universal = u.cod_universal AND p.genero = u.genero
    JOIN variantes v ON v.cod_universal = u.cod_universal AND v.genero = u.genero
    ORDER BY p.marca, p.modelo
  `);
  return toPlain<UnicoRow>(r.rows);
}
