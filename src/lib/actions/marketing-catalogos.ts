"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { IMAGENES_BASE, sesionMarketing } from "@/lib/marketing";
import { consultarCatalogoErp } from "@/lib/marketing-erp";
import { etiquetaCatalogo } from "@/lib/marketing-publico";
import {
  ALMACENES,
  armarSnapshot,
  construirBorrador,
  type Borrador,
  type FiltrosCatalogo,
  type PlantillaSnap,
} from "@/lib/marketing-catalogo";
import type { ActionResult } from "@/types";

const TEXTO_FILTRO = /^[A-Z0-9ÁÉÍÓÚÑ&./ -]{0,40}$/;

type PlantillaFila = { id: string; marca: string; ancho: number; alto: number; fondo_key: string; zonas: string };

async function plantillasActivas(): Promise<PlantillaFila[]> {
  const r = await db.execute("SELECT id, marca, ancho, alto, fondo_key, zonas FROM mk_plantillas WHERE activa = 1 ORDER BY created_at, id");
  return r.rows as unknown as PlantillaFila[];
}

export async function generarCatalogo(input: {
  titulo: string;
  almacenes: string[];
  grupo: string;
  marca: string;
  genero: string;
}): Promise<ActionResult<{ id: string }>> {
  const sesion = await sesionMarketing();
  if (!sesion) return { success: false, msg: "Sin permisos" };

  const titulo = input.titulo.trim();
  if (titulo.length < 3 || titulo.length > 100) return { success: false, msg: "El título debe tener entre 3 y 100 caracteres" };

  const filtros: FiltrosCatalogo = {
    almacenes: [...new Set(input.almacenes)].filter((a): a is (typeof ALMACENES)[number] => (ALMACENES as readonly string[]).includes(a)),
    grupo: input.grupo.trim().toUpperCase(),
    marca: input.marca.trim().toUpperCase(),
    genero: input.genero.trim().toUpperCase(),
  };
  if (filtros.almacenes.length === 0) return { success: false, msg: "Elige al menos un almacén" };
  if (![filtros.grupo, filtros.marca, filtros.genero].every((v) => TEXTO_FILTRO.test(v))) {
    return { success: false, msg: "Filtro con caracteres no válidos" };
  }
  // Sin ningún filtro se traería todo el ERP (miles de filas): se evita por error.
  if (!filtros.grupo && !filtros.marca && !filtros.genero) {
    return { success: false, msg: "Elige al menos una marca, un grupo o un género" };
  }
  if (!(await rateLimit(`mk-generar:${sesion.id}`, 6, 60_000))) {
    return { success: false, msg: "Demasiadas generaciones seguidas; espera un minuto" };
  }

  try {
    const plantillas = await plantillasActivas();
    if (plantillas.length === 0) return { success: false, msg: "No hay ninguna plantilla activa" };

    const items = await consultarCatalogoErp(filtros);

    const codigos = [...new Set(items.map((i) => i.cod_universal?.trim().toUpperCase()).filter((c): c is string => Boolean(c)))];
    const versiones = new Map<string, number>();
    if (codigos.length > 0) {
      const r = await db.execute({
        sql: "SELECT cod_universal, version FROM mk_imagenes WHERE cod_universal = ANY(?)",
        args: [codigos],
      });
      for (const f of r.rows) versiones.set(f.cod_universal as string, f.version as number);
    }

    // Plantilla de la marca; si no hay, la primera activa.
    const porMarca = new Map(plantillas.map((p) => [p.marca.toUpperCase(), p.id]));
    const borrador = construirBorrador(items, versiones, (marca) => porMarca.get(marca) ?? plantillas[0].id);
    if (borrador.paginas.length === 0) {
      const r = borrador.resumen;
      return {
        success: false,
        msg: `Ningún producto se puede mostrar: el ERP devolvió ${r.erp_items}, ${r.sin_imagen.length} sin imagen y ${r.sin_stock} sin stock o precio`,
      };
    }

    const id = randomUUID();
    await db.execute({
      sql: `INSERT INTO mk_catalogos (id, slug, titulo, filtros, borrador, created_by)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, randomBytes(9).toString("base64url"), titulo, JSON.stringify(filtros), JSON.stringify(borrador), sesion.id],
    });
    revalidatePath("/admin/marketing/catalogos");
    return { success: true, msg: `${borrador.paginas.length} páginas generadas`, data: { id } };
  } catch (e) {
    console.error("[marketing] generarCatalogo falló:", e);
    return { success: false, msg: e instanceof Error ? e.message : "No se pudo generar el catálogo" };
  }
}

export async function publicarCatalogo(id: string): Promise<ActionResult<{ version: number }>> {
  const sesion = await sesionMarketing();
  if (!sesion) return { success: false, msg: "Sin permisos" };

  try {
    const c = await db.execute({ sql: "SELECT slug, titulo, borrador FROM mk_catalogos WHERE id = ?", args: [id] });
    if (c.rows.length === 0) return { success: false, msg: "El catálogo no existe" };
    const { slug, titulo, borrador: crudo } = c.rows[0] as { slug: string; titulo: string; borrador: string };
    const borrador = JSON.parse(crudo) as Borrador;

    const ids = [...new Set(borrador.paginas.map((p) => p.plantilla))];
    const pl = await db.execute({
      sql: "SELECT id, ancho, alto, fondo_key, zonas FROM mk_plantillas WHERE id = ANY(?)",
      args: [ids],
    });
    const plantillas: Record<string, PlantillaSnap> = {};
    for (const f of pl.rows as unknown as PlantillaFila[]) {
      plantillas[f.id] = { ancho: f.ancho, alto: f.alto, fondo: f.fondo_key, zonas: JSON.parse(f.zonas) };
    }
    const faltan = ids.filter((i) => !plantillas[i]);
    if (faltan.length > 0) return { success: false, msg: `Falta la plantilla ${faltan.join(", ")}` };

    const snapshot = JSON.stringify(armarSnapshot(titulo, borrador, plantillas, IMAGENES_BASE));

    const v = await db.execute({
      sql: "SELECT COALESCE(MAX(version), 0) + 1 AS siguiente FROM mk_catalogo_versiones WHERE catalogo_id = ?",
      args: [id],
    });
    const version = v.rows[0].siguiente as number;

    await db.batch([
      {
        sql: `INSERT INTO mk_catalogo_versiones (catalogo_id, version, snapshot, paginas, publicado_por)
              VALUES (?, ?, ?, ?, ?)`,
        args: [id, version, snapshot, borrador.paginas.length, sesion.id],
      },
      {
        sql: "UPDATE mk_catalogos SET version_publicada = ?, updated_at = now_text() WHERE id = ?",
        args: [version, id],
      },
    ]);

    // Que la próxima visita ya lea la versión nueva (no una copia en caché).
    updateTag(etiquetaCatalogo(slug));
    revalidatePath(`/admin/marketing/catalogos/${id}`);
    revalidatePath("/admin/marketing/catalogos");
    return { success: true, msg: `Versión ${version} publicada`, data: { version } };
  } catch (e) {
    console.error("[marketing] publicarCatalogo falló:", e);
    return { success: false, msg: e instanceof Error ? e.message : "No se pudo publicar" };
  }
}
