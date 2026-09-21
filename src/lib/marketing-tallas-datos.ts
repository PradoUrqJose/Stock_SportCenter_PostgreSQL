// Lectura de las equivalencias de tallas (SOLO servidor).
import { db } from "@/lib/db";
import { GENEROS_TALLAS, generoCanonico, indexarTallas, marcaCanonica, tablaDe, type AvisoTallas, type IndiceTallas, type TablaTallas } from "@/lib/marketing-tallas";

/**
 * Calzado: «8», «10.5», «1Y». Sin el signo de interrogación: la capa de base de datos convierte cada «?» del SQL en un
 * parámetro, así que el «opcional» de la expresión regular se escribe {0,1}.
 */
const CALZADO = "^[0-9]{1,2}([.,][0-9]){0,1}[[:space:]]*[YCyc]{0,1}$";

/**
 * Todas las tablas, ordenadas por marca y género. Si la tabla aún no existe (falta aplicar la migración 018) devuelve vacío:
 * los catálogos siguen funcionando con la talla USA y el aviso «sin equivalencia».
 */
export async function tablasDeTallas(): Promise<TablaTallas[]> {
  try {
    const r = await db.execute("SELECT marca, genero, usa, peru, pie_cm FROM mk_tallas ORDER BY marca, genero, peru, usa");
    const mapa = new Map<string, TablaTallas>();
    for (const f of r.rows) {
      const marca = f.marca as string;
      const genero = f.genero as string;
      const k = `${marca}|${genero}`;
      const t = mapa.get(k) ?? { marca, genero, filas: [] };
      t.filas.push({ usa: f.usa as string, peru: Number(f.peru), pie_cm: f.pie_cm === null ? null : Number(f.pie_cm) });
      mapa.set(k, t);
    }
    return [...mapa.values()].sort((a, b) => a.marca.localeCompare(b.marca) || GENEROS_TALLAS.indexOf(a.genero as never) - GENEROS_TALLAS.indexOf(b.genero as never));
  } catch (e) {
    if ((e as { code?: string }).code === "42P01") return [];
    throw e;
  }
}

export async function indiceDeTallas(): Promise<IndiceTallas> {
  return indexarTallas(await tablasDeTallas());
}

/**
 * Marcas y géneros de los productos con stock que tienen tallas de calzado y NO tienen equivalencia (según lo que sabe
 * STOCK: puede haber productos nuevos del ERP que aún no conoce). Con `f` se limita a los filtros de un catálogo.
 */
export async function equivalenciasFaltantes(
  idx: IndiceTallas,
  f: { categorias?: string[]; grupos?: string[]; generos?: string[]; marcas?: string[] } = {}
): Promise<AvisoTallas[]> {
  const condiciones = ["p.stock_total > 0", "p.marca IS NOT NULL", "p.marca <> ''", `v.talla ~ '${CALZADO}'`];
  const args: unknown[] = [];
  for (const [columna, valores] of [["categoria", f.categorias], ["grupo", f.grupos], ["genero", f.generos], ["marca", f.marcas]] as const) {
    if (valores && valores.length > 0) {
      condiciones.push(`p.${columna} = ANY(?)`);
      args.push(valores);
    }
  }
  const r = await db.execute({
    sql: `SELECT p.marca, p.genero, COUNT(DISTINCT p.cod_universal)::int AS productos
          FROM productos p JOIN variantes v ON v.cod_universal = p.cod_universal AND v.genero = p.genero
          WHERE ${condiciones.join(" AND ")} GROUP BY 1, 2`,
    args: args as never[],
  });
  return r.rows
    .map((x) => ({ marca: marcaCanonica(x.marca as string), genero: generoCanonico((x.genero as string) ?? ""), productos: x.productos as number }))
    .filter((x) => x.genero !== "" && !tablaDe(idx, x.marca, x.genero))
    .map((x) => ({ ...x, motivo: "sin_tabla" as const }))
    .sort((a, b) => b.productos - a.productos || a.marca.localeCompare(b.marca));
}
