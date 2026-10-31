// Opciones compartidas de Marketing (SOLO servidor). Las marcas no dependen de tener productos importados.
import { db } from "@/lib/db";
import { ordenarOpcionesTalla } from "@/lib/marketing-catalogo";
import { combinarMarcasMarketing } from "@/lib/marketing-marcas";

export async function marcasDeMarketing(): Promise<string[]> {
  const r = await db.execute(`SELECT marca FROM (
    SELECT marca, COUNT(*) AS frecuencia FROM productos WHERE marca IS NOT NULL AND TRIM(marca) <> '' GROUP BY marca
    UNION ALL SELECT marca, 0 FROM mk_plantillas WHERE marca IS NOT NULL
    UNION ALL SELECT marca, 0 FROM mk_tallas WHERE marca IS NOT NULL
  ) AS fuentes GROUP BY marca ORDER BY SUM(frecuencia) DESC, marca`);
  return combinarMarcasMarketing(r.rows.map((f) => f.marca as string));
}

// Los más frecuentes primero.
async function valores(columna: "grupo" | "genero" | "categoria"): Promise<string[]> {
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
  const [marcas, grupos, generos, categorias, tallas] = await Promise.all([marcasDeMarketing(), valores("grupo"), valores("genero"), valores("categoria"), valoresTalla()]);
  return { marcas, grupos, generos, categorias, tallas };
}
