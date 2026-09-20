"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { sesionMarketing } from "@/lib/marketing";
import { TIPOS_IDS, enlaceDeContacto, validarZonasEnlace, type ZonasPlantilla } from "@/lib/marketing-catalogo";
import type { ActionResult } from "@/types";

const ID = /^[a-z0-9-]{1,80}$/;
const TEXTO = /^[A-Z0-9ÁÉÍÓÚÑ&./ -]{1,40}$/;

/** Hace de una plantilla la predeterminada de su marca (las demás de la marca dejan de serlo). */
export async function marcarPredeterminada(id: string): Promise<ActionResult> {
  if (!(await sesionMarketing())) return { success: false, msg: "Sin permisos" };
  if (!ID.test(id)) return { success: false, msg: "Plantilla no válida" };
  try {
    const r = await db.execute({ sql: "SELECT marca, activa FROM mk_plantillas WHERE id = ?", args: [id] });
    if (r.rows.length === 0) return { success: false, msg: "La plantilla no existe" };
    if (r.rows[0].activa !== 1) return { success: false, msg: "Activa la plantilla antes de hacerla predeterminada" };
    await db.batch([
      { sql: "UPDATE mk_plantillas SET predeterminada = 0 WHERE marca = ?", args: [r.rows[0].marca] },
      { sql: "UPDATE mk_plantillas SET predeterminada = 1 WHERE id = ?", args: [id] },
    ]);
    revalidatePath("/admin/marketing/catalogos/nuevo");
    revalidatePath("/admin/marketing/catalogos/disenos");
    return { success: true, msg: "Plantilla predeterminada" };
  } catch (e) {
    console.error("[marketing] marcarPredeterminada falló:", e);
    return { success: false, msg: "No se pudo cambiar la plantilla predeterminada" };
  }
}

/**
 * Activa o desactiva un diseño (plantilla o página fija). Desactivar no borra nada: los
 * catálogos ya publicados lo siguen mostrando; solo deja de ofrecerse y de usarse al generar.
 * Una plantilla predeterminada deja de serlo al desactivarla.
 */
export async function activarDiseno(clase: "plantilla" | "fija", id: string, activa: boolean): Promise<ActionResult> {
  if (!(await sesionMarketing())) return { success: false, msg: "Sin permisos" };
  if (!ID.test(id)) return { success: false, msg: "Diseño no válido" };
  try {
    if (clase === "plantilla") {
      await db.execute({
        sql: `UPDATE mk_plantillas SET activa = ?, predeterminada = CASE WHEN ? = 1 THEN predeterminada ELSE 0 END WHERE id = ?`,
        args: [activa ? 1 : 0, activa ? 1 : 0, id],
      });
    } else {
      await db.execute({ sql: "UPDATE mk_paginas_fijas SET activa = ? WHERE id = ?", args: [activa ? 1 : 0, id] });
    }
    revalidatePath("/admin/marketing/catalogos/nuevo");
    revalidatePath("/admin/marketing/catalogos/disenos");
    return { success: true, msg: activa ? "Diseño activado" : "Diseño desactivado" };
  } catch (e) {
    console.error("[marketing] activarDiseno falló:", e);
    return { success: false, msg: "No se pudo cambiar el diseño" };
  }
}

const TIPOS_CATALOGO = new Set([...TIPOS_IDS, "*"]);

/**
 * Guarda las zonas clicables de una página fija (rectángulos sobre la imagen, en fracciones de 0 a 1). Los catálogos
 * las toman al publicarse: los ya publicados conservan los enlaces con los que salieron.
 */
export async function guardarZonasFija(id: string, zonas: unknown): Promise<ActionResult> {
  if (!(await sesionMarketing())) return { success: false, msg: "Sin permisos" };
  if (!ID.test(id)) return { success: false, msg: "Página no válida" };
  const limpias = validarZonasEnlace(zonas);
  if (typeof limpias === "string") return { success: false, msg: limpias };
  try {
    const r = await db.execute({
      sql: "UPDATE mk_paginas_fijas SET zonas = ? WHERE id = ?",
      args: [limpias.length > 0 ? JSON.stringify(limpias) : null, id],
    });
    if (r.rowsAffected === 0) return { success: false, msg: "La página no existe" };
    revalidatePath("/admin/marketing/catalogos/disenos");
    return { success: true, msg: limpias.length > 0 ? "Zonas guardadas" : "Zonas quitadas" };
  } catch (e) {
    console.error("[marketing] guardarZonasFija falló:", e);
    return { success: false, msg: "No se pudieron guardar las zonas" };
  }
}

type DatoEnlace = { valor: string; mensaje?: string };

/**
 * Guarda los enlaces de contacto (WhatsApp, Instagram, TikTok, Facebook). Un dato vacío se borra: las zonas de ese
 * tipo dejan de llevar enlace en las próximas publicaciones.
 */
export async function guardarEnlaces(datos: Record<"whatsapp" | "instagram" | "tiktok" | "facebook", DatoEnlace>): Promise<ActionResult> {
  if (!(await sesionMarketing())) return { success: false, msg: "Sin permisos" };
  const nombres = { whatsapp: "WhatsApp", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" } as const;
  const sentencias: { sql: string; args: unknown[] }[] = [];
  for (const clave of Object.keys(nombres) as (keyof typeof nombres)[]) {
    const valor = String(datos?.[clave]?.valor ?? "").trim().slice(0, 200);
    const mensaje = String(datos?.[clave]?.mensaje ?? "").trim().slice(0, 200);
    if (!valor) {
      sentencias.push({ sql: "DELETE FROM mk_enlaces WHERE clave = ?", args: [clave] });
      continue;
    }
    if (enlaceDeContacto(clave, { valor, mensaje }) === null) return { success: false, msg: `El dato de ${nombres[clave]} no es válido` };
    sentencias.push({
      sql: `INSERT INTO mk_enlaces (clave, valor, mensaje, updated_at) VALUES (?, ?, ?, now_text())
            ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, mensaje = excluded.mensaje, updated_at = now_text()`,
      args: [clave, valor, clave === "whatsapp" && mensaje ? mensaje : null],
    });
  }
  try {
    await db.batch(sentencias as never);
    revalidatePath("/admin/marketing/catalogos/disenos");
    return { success: true, msg: "Enlaces guardados" };
  } catch (e) {
    console.error("[marketing] guardarEnlaces falló:", e);
    return { success: false, msg: "No se pudieron guardar los enlaces" };
  }
}

/**
 * Define en qué catálogos se usa una página fija y cómo: `aplica` vacío = a mano; con `posicion` inicio/final
 * se pone sola al generar; con `posicion` vacía solo se sugiere (Preview) y se ubica en el editor.
 */
export async function guardarUsoFija(id: string, aplica: string[], posicion: "" | "inicio" | "final"): Promise<ActionResult> {
  if (!(await sesionMarketing())) return { success: false, msg: "Sin permisos" };
  if (!ID.test(id)) return { success: false, msg: "Página no válida" };
  if (!Array.isArray(aplica) || !aplica.every((t) => TIPOS_CATALOGO.has(t))) return { success: false, msg: "Tipo de catálogo no válido" };
  if (!["", "inicio", "final"].includes(posicion)) return { success: false, msg: "Posición no válida" };
  if (aplica.length === 0 && posicion !== "") return { success: false, msg: "Elige en qué catálogos se usa" };
  try {
    await db.execute({
      sql: "UPDATE mk_paginas_fijas SET auto_tipo = ?, auto_posicion = ? WHERE id = ?",
      args: [aplica.length > 0 ? aplica.join(",") : null, posicion || null, id],
    });
    revalidatePath("/admin/marketing/catalogos/disenos");
    return { success: true, msg: "Guardado" };
  } catch (e) {
    console.error("[marketing] guardarUsoFija falló:", e);
    return { success: false, msg: "No se pudo guardar" };
  }
}

/**
 * Guarda dónde va la zapatilla en una o varias plantillas. Vale para los catálogos que se generen
 * desde ahora: los ya generados y publicados conservan la posición con la que salieron.
 */
export async function guardarPosicionZapatilla(
  ids: string[],
  zona: { x: number; y: number; w: number }
): Promise<ActionResult<{ actualizadas: number }>> {
  if (!(await sesionMarketing())) return { success: false, msg: "Sin permisos" };
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 50 || !ids.every((i) => ID.test(i))) return { success: false, msg: "Plantillas no válidas" };
  const { x, y, w } = zona ?? {};
  if (![x, y, w].every(Number.isFinite) || w < 200 || w > 2400 || x < -800 || x > 2400 || y < -800 || y > 1600) {
    return { success: false, msg: "La posición está fuera de los límites" };
  }
  try {
    const r = await db.execute({ sql: "SELECT id, zonas FROM mk_plantillas WHERE id = ANY(?)", args: [ids] });
    if (r.rows.length === 0) return { success: false, msg: "Las plantillas no existen" };
    await db.batch(
      r.rows.map((f) => {
        const zonas = JSON.parse(f.zonas as string) as ZonasPlantilla;
        // La imagen de la zapatilla es cuadrada: la zona también.
        zonas.zapatilla = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(w) };
        return { sql: "UPDATE mk_plantillas SET zonas = ? WHERE id = ?", args: [JSON.stringify(zonas), f.id] };
      })
    );
    revalidatePath("/admin/marketing/catalogos/nuevo");
    return { success: true, msg: "Posición guardada", data: { actualizadas: r.rows.length } };
  } catch (e) {
    console.error("[marketing] guardarPosicionZapatilla falló:", e);
    return { success: false, msg: "No se pudo guardar la posición" };
  }
}

export type MarcaAfectada = { marca: string; productos: number };

/**
 * Marcas que traería un catálogo con estos filtros (según los productos que hoy tienen stock en el
 * sistema, para orientar la elección de plantillas antes de consultar el ERP).
 */
export async function marcasAfectadas(f: {
  categorias: string[];
  grupos: string[];
  generos: string[];
  marcas: string[];
}): Promise<ActionResult<MarcaAfectada[]>> {
  if (!(await sesionMarketing())) return { success: false, msg: "Sin permisos" };
  const listas = [f.categorias, f.grupos, f.generos, f.marcas];
  if (!listas.every((l) => Array.isArray(l) && l.length <= 60 && l.every((v) => typeof v === "string" && TEXTO.test(v)))) {
    return { success: false, msg: "Filtro no válido" };
  }
  try {
    const condiciones = ["stock_total > 0"];
    const args: unknown[] = [];
    for (const [columna, valores] of [["categoria", f.categorias], ["grupo", f.grupos], ["genero", f.generos], ["marca", f.marcas]] as const) {
      if (valores.length > 0) {
        condiciones.push(`${columna} = ANY(?)`);
        args.push(valores);
      }
    }
    const r = await db.execute({
      sql: `SELECT COALESCE(marca, '') AS marca, COUNT(*)::int AS productos FROM productos WHERE ${condiciones.join(" AND ")} GROUP BY 1 ORDER BY 2 DESC`,
      args: args as never[],
    });
    return { success: true, msg: "", data: r.rows.map((x) => ({ marca: (x.marca as string) || "(SIN MARCA)", productos: x.productos as number })) };
  } catch (e) {
    console.error("[marketing] marcasAfectadas falló:", e);
    return { success: false, msg: "No se pudo consultar las marcas" };
  }
}
