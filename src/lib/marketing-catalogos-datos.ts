// Lecturas de servidor compartidas por las acciones de catálogos y las páginas
// del editor: plantillas y versiones de imagen al día.
import { db } from "@/lib/db";
import type { Borrador, PlantillaSnap } from "@/lib/marketing-catalogo";

type PlantillaFila = { id: string; ancho: number; alto: number; fondo_key: string; zonas: string };

/** Plantillas (zonas incluidas) por id; sin ids devuelve todas las activas. */
export async function plantillasPorId(ids?: string[]): Promise<Record<string, PlantillaSnap>> {
  const r = ids
    ? await db.execute({ sql: "SELECT id, ancho, alto, fondo_key, zonas FROM mk_plantillas WHERE id = ANY(?)", args: [ids] })
    : await db.execute("SELECT id, ancho, alto, fondo_key, zonas FROM mk_plantillas WHERE activa = 1");
  const salida: Record<string, PlantillaSnap> = {};
  for (const f of r.rows as unknown as PlantillaFila[]) {
    salida[f.id] = { ancho: f.ancho, alto: f.alto, fondo: f.fondo_key, zonas: JSON.parse(f.zonas) };
  }
  return salida;
}

/**
 * Pone en cada producto la versión vigente de su imagen. Así una imagen
 * reemplazada después de generar el catálogo se ve en el editor y sale en la
 * próxima publicación sin tener que regenerarlo.
 */
export async function sincronizarVersiones(b: Borrador): Promise<Borrador> {
  const codigos = [...new Set(b.productos.map((p) => p.cod))];
  if (codigos.length === 0) return b;
  const r = await db.execute({
    sql: "SELECT cod_universal, version FROM mk_imagenes WHERE cod_universal = ANY(?)",
    args: [codigos],
  });
  const vigente = new Map(r.rows.map((f) => [f.cod_universal as string, f.version as number]));
  return {
    ...b,
    productos: b.productos.map((p) => {
      const v = vigente.get(p.cod);
      return v !== undefined && v !== p.v ? { ...p, v } : p;
    }),
  };
}
