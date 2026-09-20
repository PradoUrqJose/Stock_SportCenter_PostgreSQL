// Lecturas de servidor compartidas por las acciones de catálogos y las páginas
// del editor: plantillas y versiones de imagen al día.
import { db } from "@/lib/db";
import type { Borrador, FijaBiblioteca, PlantillaLista, PlantillaSnap, Snapshot } from "@/lib/marketing-catalogo";

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

/**
 * Contenido editable de una versión publicada: su edición en curso si la hay y,
 * si no, el snapshot tal como se publicó (que ya lleva solo lo que usa, sin las
 * páginas quitadas). `null` si la versión no existe.
 */
export async function borradorDeVersion(
  catalogoId: string,
  version: number
): Promise<{ borrador: Borrador; conCambios: boolean } | null> {
  const r = await db.execute({
    sql: `SELECT v.snapshot, v.borrador AS edicion, c.borrador AS generado
          FROM mk_catalogo_versiones v JOIN mk_catalogos c ON c.id = v.catalogo_id
          WHERE v.catalogo_id = ? AND v.version = ?`,
    args: [catalogoId, version],
  });
  if (r.rows.length === 0) return null;
  const f = r.rows[0] as unknown as { snapshot: string; edicion: string | null; generado: string };
  if (f.edicion) return { borrador: JSON.parse(f.edicion) as Borrador, conCambios: true };

  const snap = JSON.parse(f.snapshot) as Snapshot;
  const { resumen } = JSON.parse(f.generado) as Borrador;
  return {
    borrador: { productos: snap.productos, paginas: snap.paginas, quitadas: [], resumen: { ...resumen, paginas: snap.paginas.length } },
    conCambios: false,
  };
}

/** Páginas fijas activas de la biblioteca, en su orden. */
export async function fijasDeBiblioteca(): Promise<FijaBiblioteca[]> {
  const r = await db.execute(
    "SELECT id, nombre, tipo, imagen, ancho, alto, auto_tipo, auto_posicion FROM mk_paginas_fijas WHERE activa = 1 ORDER BY orden, id"
  );
  return r.rows as unknown as FijaBiblioteca[];
}

/** Todas las plantillas (activas o no) con su marca y si son la predeterminada, ordenadas por marca; la genérica al final. */
export async function plantillasGestion(): Promise<PlantillaLista[]> {
  const r = await db.execute(
    `SELECT id, marca, nombre, activa, predeterminada, fondo_key, ancho, alto, zonas
     FROM mk_plantillas ORDER BY (marca = '*'), marca, predeterminada DESC, created_at, id`
  );
  return r.rows.map((f) => ({
    id: f.id as string,
    marca: f.marca as string,
    nombre: f.nombre as string,
    activa: f.activa === 1,
    predeterminada: f.predeterminada === 1,
    fondo: f.fondo_key as string,
    ancho: f.ancho as number,
    alto: f.alto as number,
    zonas: JSON.parse(f.zonas as string),
  }));
}

/** Todas las páginas fijas (activas o no), para la pantalla de plantillas. */
export async function fijasGestion(): Promise<(FijaBiblioteca & { activa: boolean })[]> {
  const r = await db.execute(
    "SELECT id, nombre, tipo, imagen, ancho, alto, auto_tipo, auto_posicion, activa FROM mk_paginas_fijas ORDER BY orden, id"
  );
  return r.rows.map((f) => ({ ...(f as unknown as FijaBiblioteca), activa: f.activa === 1 }));
}
