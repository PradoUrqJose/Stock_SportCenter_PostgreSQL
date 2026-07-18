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

// Productos con una sola unidad en stock en total, sumando TODOS los géneros de ese
// cod_universal — no basta con que un género individual tenga 1 sola variante, porque
// el mismo cod_universal puede tener stock en otros géneros (p.ej. HOMBRE: 7, PRESCOLAR: 1),
// y en ese caso no es único.
export async function fetchUnicos(): Promise<UnicoRow[]> {
  const r = await db.execute(`
    WITH totales AS (
      SELECT cod_universal
      FROM variantes
      GROUP BY cod_universal
      HAVING COUNT(*) = 1
    )
    SELECT p.cod_universal, p.genero, p.marca, p.modelo, p.categoria, p.color,
      p.precio_lista, p.descuento,
      v.talla, v.alm_izq, v.alm_der, v.ingreso_fecha,
      CAST(CURRENT_DATE - v.ingreso_fecha::date AS INTEGER) AS antiguedad_dias
    FROM totales t
    JOIN variantes v ON v.cod_universal = t.cod_universal
    JOIN productos p ON p.cod_universal = v.cod_universal AND p.genero = v.genero
    ORDER BY p.marca, p.modelo
  `);
  return toPlain<UnicoRow>(r.rows);
}
