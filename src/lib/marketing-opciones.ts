// Valores que existen hoy en los productos, para los filtros del asistente de catálogos (SOLO servidor).
import { db } from "@/lib/db";
import { ordenarOpcionesTalla } from "@/lib/marketing-catalogo";

// Los más frecuentes primero.
async function valores(columna: "marca" | "grupo" | "genero" | "categoria"): Promise<string[]> {
  const r = await db.execute(
    `SELECT ${columna} AS v FROM productos WHERE ${columna} IS NOT NULL GROUP BY 1 ORDER BY COUNT(*) DESC, 1`
  );
  return r.rows.map((f) => f.v as string);
}

// Tallas que existen en los productos (escala USA del ERP), para el filtro de talla.
async function valoresTalla(): Promise<string[]> {
  const r = await db.execute("SELECT DISTINCT UPPER(TRIM(talla)) AS v FROM variantes WHERE talla IS NOT NULL AND TRIM(talla) <> ''");
  return ordenarOpcionesTalla(r.rows.map((f) => f.v as string));
}

export async function opcionesDeFiltros(): Promise<{ marcas: string[]; grupos: string[]; generos: string[]; categorias: string[]; tallas: string[] }> {
  const [marcas, grupos, generos, categorias, tallas] = await Promise.all([valores("marca"), valores("grupo"), valores("genero"), valores("categoria"), valoresTalla()]);
  return { marcas, grupos, generos, categorias, tallas };
}
