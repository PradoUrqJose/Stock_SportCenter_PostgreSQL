"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { sesionMarketing } from "@/lib/marketing";
import { equivalenciasFaltantes, indiceDeTallas, tablasDeTallas } from "@/lib/marketing-tallas-datos";
import { generoCanonico, marcaCanonica, validarFilasTallas, type AvisoTallas, type ErrorFila, type FilaEntrada, type TablaTallas } from "@/lib/marketing-tallas";
import { valoresFiltro } from "@/lib/marketing-validar";
import type { ActionResult } from "@/types";

const MAX_FILAS = 5000;

/** Sentencias que dejan UNA tabla (marca y género) exactamente como viene: borra la anterior y escribe las filas. */
function reemplazarTabla(t: TablaTallas, usuario: string) {
  return [
    { sql: "DELETE FROM mk_tallas WHERE marca = ? AND genero = ?", args: [t.marca, t.genero] },
    ...t.filas.map((f) => ({
      sql: "INSERT INTO mk_tallas (marca, genero, usa, peru, pie_cm, updated_by) VALUES (?, ?, ?, ?, ?, ?)",
      args: [t.marca, t.genero, f.usa, f.peru, f.pie_cm, usuario],
    })),
  ];
}

const errorTexto = (e: ErrorFila[]) => e.slice(0, 3).map((x) => `fila ${x.fila}: ${x.mensaje}`).join("; ") + (e.length > 3 ? ` (y ${e.length - 3} más)` : "");

/**
 * Guarda la tabla de una marca y género desde el formulario web: reemplaza lo que hubiera. Si se cambió la marca o el género
 * de una tabla existente, `original` dice cuál era para no dejarla duplicada.
 */
export async function guardarTablaTallas(input: {
  marca: string;
  genero: string;
  filas: { peru: unknown; usa: unknown; pie_cm: unknown }[];
  original?: { marca: string; genero: string };
}): Promise<ActionResult<{ marca: string; genero: string }>> {
  const sesion = await sesionMarketing();
  if (!sesion) return { success: false, msg: "Sin permisos" };
  if (!Array.isArray(input.filas) || input.filas.length === 0) return { success: false, msg: "Agrega al menos una talla" };
  if (input.filas.length > 200) return { success: false, msg: "Demasiadas tallas para una tabla" };

  const v = validarFilasTallas(input.filas.map((f, i) => ({ fila: i + 1, marca: input.marca, genero: input.genero, peru: f.peru, usa: f.usa, pie_cm: f.pie_cm })));
  if (v.errores.length > 0) return { success: false, msg: errorTexto(v.errores) };
  if (v.tablas.length !== 1) return { success: false, msg: "Agrega al menos una talla" };
  const t = v.tablas[0];

  try {
    const cambioClave = input.original && (marcaCanonica(input.original.marca) !== t.marca || generoCanonico(input.original.genero) !== t.genero);
    await db.batch([
      ...(cambioClave ? [{ sql: "DELETE FROM mk_tallas WHERE marca = ? AND genero = ?", args: [marcaCanonica(input.original!.marca), generoCanonico(input.original!.genero)] }] : []),
      ...reemplazarTabla(t, sesion.id),
    ]);
    revalidatePath("/admin/marketing/tallas");
    return { success: true, msg: `Guardada la equivalencia de ${t.marca} · ${t.genero}`, data: { marca: t.marca, genero: t.genero } };
  } catch (e) {
    console.error("[marketing] guardarTablaTallas falló:", e);
    return { success: false, msg: "No se pudo guardar (¿ya aplicaste la migración 018?)" };
  }
}

export async function eliminarTablaTallas(marca: string, genero: string): Promise<ActionResult> {
  if (!(await sesionMarketing())) return { success: false, msg: "Sin permisos" };
  try {
    await db.execute({ sql: "DELETE FROM mk_tallas WHERE marca = ? AND genero = ?", args: [marcaCanonica(String(marca)), generoCanonico(String(genero))] });
    revalidatePath("/admin/marketing/tallas");
    return { success: true, msg: "Equivalencia eliminada" };
  } catch (e) {
    console.error("[marketing] eliminarTablaTallas falló:", e);
    return { success: false, msg: "No se pudo eliminar" };
  }
}

export type VistaTabla = { marca: string; genero: string; filas: number; accion: "nueva" | "reemplaza"; filasAntes: number };

/** Qué haría subir este archivo, sin escribir nada: las tablas que crea o reemplaza y las filas con problemas. */
export async function vistaPreviaTallas(filas: FilaEntrada[]): Promise<ActionResult<{ tablas: VistaTabla[]; errores: ErrorFila[] }>> {
  if (!(await sesionMarketing())) return { success: false, msg: "Sin permisos" };
  if (!Array.isArray(filas) || filas.length === 0) return { success: false, msg: "El archivo no tiene filas" };
  if (filas.length > MAX_FILAS) return { success: false, msg: `El archivo tiene demasiadas filas (máximo ${MAX_FILAS})` };
  try {
    const v = validarFilasTallas(filas);
    const actuales = new Map((await tablasDeTallas()).map((t) => [`${t.marca}|${t.genero}`, t.filas.length]));
    return {
      success: true,
      msg: "",
      data: {
        tablas: v.tablas.map((t) => ({ marca: t.marca, genero: t.genero, filas: t.filas.length, accion: actuales.has(`${t.marca}|${t.genero}`) ? "reemplaza" : "nueva", filasAntes: actuales.get(`${t.marca}|${t.genero}`) ?? 0 })),
        errores: v.errores.slice(0, 200),
      },
    };
  } catch (e) {
    console.error("[marketing] vistaPreviaTallas falló:", e);
    return { success: false, msg: "No se pudo revisar el archivo" };
  }
}

/**
 * Aplica el archivo: la tabla de cada marca y género que trae REEMPLAZA a la que existía; lo que no trae no se toca. Las filas
 * con problemas no entran (se informan). Todo en una sola transacción: o entra todo o nada.
 */
export async function aplicarImportacionTallas(filas: FilaEntrada[]): Promise<ActionResult<{ tablas: number; filas: number; omitidas: number }>> {
  const sesion = await sesionMarketing();
  if (!sesion) return { success: false, msg: "Sin permisos" };
  if (!Array.isArray(filas) || filas.length === 0) return { success: false, msg: "El archivo no tiene filas" };
  if (filas.length > MAX_FILAS) return { success: false, msg: `El archivo tiene demasiadas filas (máximo ${MAX_FILAS})` };
  const v = validarFilasTallas(filas);
  if (v.tablas.length === 0) return { success: false, msg: v.errores.length > 0 ? errorTexto(v.errores) : "No hay tallas válidas para importar" };
  try {
    await db.batch(v.tablas.flatMap((t) => reemplazarTabla(t, sesion.id)));
    revalidatePath("/admin/marketing/tallas");
    return {
      success: true,
      msg: `Importadas ${v.tablas.length} tabla${v.tablas.length === 1 ? "" : "s"}`,
      data: { tablas: v.tablas.length, filas: v.tablas.reduce((a, t) => a + t.filas.length, 0), omitidas: v.errores.length },
    };
  } catch (e) {
    console.error("[marketing] aplicarImportacionTallas falló:", e);
    return { success: false, msg: "No se pudo importar (¿ya aplicaste la migración 018?)" };
  }
}

/**
 * Marcas y géneros del catálogo que se va a generar (según los productos con stock que conoce STOCK) que no tienen
 * equivalencia de tallas: saldrán con talla USA.
 */
export async function tallasSinEquivalencia(f: { categorias: string[]; grupos: string[]; generos: string[]; marcas: string[] }): Promise<ActionResult<AvisoTallas[]>> {
  if (!(await sesionMarketing())) return { success: false, msg: "Sin permisos" };
  const c = valoresFiltro(f.categorias), g = valoresFiltro(f.grupos), ge = valoresFiltro(f.generos), m = valoresFiltro(f.marcas);
  if (!c || !g || !ge || !m) return { success: false, msg: "Filtro no válido" };
  try {
    return { success: true, msg: "", data: await equivalenciasFaltantes(await indiceDeTallas(), { categorias: c, grupos: g, generos: ge, marcas: m }) };
  } catch (e) {
    console.error("[marketing] tallasSinEquivalencia falló:", e);
    return { success: false, msg: "No se pudo revisar las equivalencias de tallas" };
  }
}
