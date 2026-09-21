"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { sesionMarketing } from "@/lib/marketing";
import { TIPOS_DE_FABRICA, type FiltrosDeTipo } from "@/lib/marketing-catalogo";
import { tiposCatalogo } from "@/lib/marketing-tipos";
import { precioFiltro, valoresFiltro, valoresTalla } from "@/lib/marketing-validar";
import type { ActionResult } from "@/types";

/** Lo que se guarda de un tipo: nombre, descripción y los filtros que llena. */
export type EntradaTipo = {
  nombre: string;
  descripcion?: string;
} & Partial<{ [K in keyof FiltrosDeTipo]: unknown }>;

type Validado = { nombre: string; descripcion: string; filtros: FiltrosDeTipo };

function validar(e: EntradaTipo): Validado | string {
  const nombre = String(e.nombre ?? "").trim().replace(/\s+/g, " ");
  if (nombre.length < 2 || nombre.length > 40) return "El nombre debe tener entre 2 y 40 caracteres";
  const descripcion = String(e.descripcion ?? "").trim();
  if (descripcion.length > 120) return "La descripción puede tener hasta 120 caracteres";
  const categorias = valoresFiltro(e.categorias ?? []);
  const grupos = valoresFiltro(e.grupos ?? []);
  const generos = valoresFiltro(e.generos ?? []);
  const marcas = valoresFiltro(e.marcas ?? []);
  const tallas = valoresTalla(e.tallas ?? []);
  if (!categorias || !grupos || !generos || !marcas || !tallas) return "Filtro con caracteres no válidos";
  const precio_min = precioFiltro(e.precio_min);
  const precio_max = precioFiltro(e.precio_max);
  if (precio_min === undefined || precio_max === undefined) return "El precio debe ser un número válido";
  if (precio_min != null && precio_max != null && precio_min > precio_max) return "El precio mínimo no puede ser mayor que el máximo";
  // Solo talla o precio traerían todo el ERP: el tipo tiene que acotar por algo más.
  if (categorias.length + grupos.length + generos.length + marcas.length === 0) {
    return "El tipo necesita al menos una categoría, grupo, género o marca (solo la talla o el precio traerían todo el ERP)";
  }
  return { nombre, descripcion, filtros: { categorias, grupos, generos, marcas, tallas, precio_min, precio_max } };
}

const ID_TIPO = /^[a-z0-9-]{1,40}$/;
const refrescar = () => {
  revalidatePath("/admin/marketing/catalogos/tipos");
  revalidatePath("/admin/marketing/catalogos/nuevo");
  revalidatePath("/admin/marketing/catalogos/disenos");
  revalidatePath("/admin/marketing/catalogos");
};

async function nombreRepetido(nombre: string, exceptoId?: string): Promise<boolean> {
  const n = nombre.toLowerCase();
  return (await tiposCatalogo()).some((t) => t.id !== exceptoId && t.nombre.toLowerCase() === n);
}

/** Crea un tipo de catálogo personalizado (queda junto a los de fábrica, con sus mismas capacidades). */
export async function crearTipo(entrada: EntradaTipo): Promise<ActionResult<{ id: string }>> {
  const sesion = await sesionMarketing();
  if (!sesion) return { success: false, msg: "Sin permisos" };
  const v = validar(entrada);
  if (typeof v === "string") return { success: false, msg: v };
  if (await nombreRepetido(v.nombre)) return { success: false, msg: "Ya existe un tipo con ese nombre" };
  try {
    const id = `c-${randomBytes(4).toString("hex")}`;
    const orden = await db.execute("SELECT COALESCE(MAX(orden), 0) + 1 AS n FROM mk_tipos");
    await db.execute({
      sql: "INSERT INTO mk_tipos (id, nombre, descripcion, filtros, base, activo, orden, created_by) VALUES (?, ?, ?, ?, 0, 1, ?, ?)",
      args: [id, v.nombre, v.descripcion, JSON.stringify(v.filtros), orden.rows[0].n as number, sesion.id],
    });
    refrescar();
    return { success: true, msg: "Tipo creado", data: { id } };
  } catch (e) {
    console.error("[marketing] crearTipo falló:", e);
    return { success: false, msg: "No se pudo crear el tipo (¿se aplicó la migración de tipos?)" };
  }
}

/** Cambia el nombre, la descripción y los filtros de un tipo (también de los de fábrica). No toca los catálogos ya generados. */
export async function actualizarTipo(id: string, entrada: EntradaTipo): Promise<ActionResult> {
  if (!(await sesionMarketing())) return { success: false, msg: "Sin permisos" };
  if (!ID_TIPO.test(id)) return { success: false, msg: "Tipo no válido" };
  const v = validar(entrada);
  if (typeof v === "string") return { success: false, msg: v };
  if (await nombreRepetido(v.nombre, id)) return { success: false, msg: "Ya existe un tipo con ese nombre" };
  try {
    const r = await db.execute({
      sql: "UPDATE mk_tipos SET nombre = ?, descripcion = ?, filtros = ?, updated_at = now_text() WHERE id = ?",
      args: [v.nombre, v.descripcion, JSON.stringify(v.filtros), id],
    });
    if (r.rowsAffected === 0) return { success: false, msg: "El tipo no existe" };
    refrescar();
    return { success: true, msg: "Tipo guardado" };
  } catch (e) {
    console.error("[marketing] actualizarTipo falló:", e);
    return { success: false, msg: "No se pudo guardar el tipo" };
  }
}

/** Muestra u oculta un tipo en el asistente (los catálogos ya generados no cambian). */
export async function activarTipo(id: string, activo: boolean): Promise<ActionResult> {
  if (!(await sesionMarketing())) return { success: false, msg: "Sin permisos" };
  if (!ID_TIPO.test(id)) return { success: false, msg: "Tipo no válido" };
  try {
    const r = await db.execute({ sql: "UPDATE mk_tipos SET activo = ?, updated_at = now_text() WHERE id = ?", args: [activo ? 1 : 0, id] });
    if (r.rowsAffected === 0) return { success: false, msg: "El tipo no existe" };
    refrescar();
    return { success: true, msg: activo ? "Tipo activado" : "Tipo desactivado" };
  } catch (e) {
    console.error("[marketing] activarTipo falló:", e);
    return { success: false, msg: "No se pudo cambiar el tipo" };
  }
}

/** Saca un id de tipo de las páginas fijas que lo listan (portadas, términos…), para que no queden apuntando a un tipo borrado. */
async function quitarDeFijas(id: string) {
  const r = await db.execute({ sql: "SELECT id, auto_tipo FROM mk_paginas_fijas WHERE auto_tipo IS NOT NULL AND (',' || auto_tipo || ',') LIKE ?", args: [`%,${id},%`] });
  for (const f of r.rows) {
    const resto = String(f.auto_tipo).split(",").map((t) => t.trim()).filter((t) => t && t !== id);
    // Si la página aún aplica a otros tipos conserva su posición; si no aplica a ninguno, deja de ser automática.
    await db.execute(
      resto.length > 0
        ? { sql: "UPDATE mk_paginas_fijas SET auto_tipo = ? WHERE id = ?", args: [resto.join(","), f.id] }
        : { sql: "UPDATE mk_paginas_fijas SET auto_tipo = NULL, auto_posicion = NULL WHERE id = ?", args: [f.id] }
    );
  }
}

/** Borra un tipo personalizado. Los de fábrica no se borran (se desactivan o se restauran). */
export async function eliminarTipo(id: string): Promise<ActionResult> {
  if (!(await sesionMarketing())) return { success: false, msg: "Sin permisos" };
  if (!ID_TIPO.test(id)) return { success: false, msg: "Tipo no válido" };
  try {
    const t = await db.execute({ sql: "SELECT base FROM mk_tipos WHERE id = ?", args: [id] });
    if (t.rows.length === 0) return { success: false, msg: "El tipo no existe" };
    if (t.rows[0].base === 1) return { success: false, msg: "Los tipos de fábrica no se borran: puedes desactivarlos" };
    await quitarDeFijas(id);
    await db.execute({ sql: "DELETE FROM mk_tipos WHERE id = ?", args: [id] });
    refrescar();
    return { success: true, msg: "Tipo borrado" };
  } catch (e) {
    console.error("[marketing] eliminarTipo falló:", e);
    return { success: false, msg: "No se pudo borrar el tipo" };
  }
}

/** Devuelve un tipo de fábrica a su nombre, descripción y filtros originales. */
export async function restaurarTipo(id: string): Promise<ActionResult> {
  if (!(await sesionMarketing())) return { success: false, msg: "Sin permisos" };
  const f = TIPOS_DE_FABRICA.find((t) => t.id === id);
  if (!f) return { success: false, msg: "Solo los tipos de fábrica se pueden restaurar" };
  try {
    const filtros: FiltrosDeTipo = { categorias: f.categorias, grupos: f.grupos, generos: f.generos, marcas: f.marcas, tallas: f.tallas, precio_min: f.precio_min, precio_max: f.precio_max };
    await db.execute({
      sql: "UPDATE mk_tipos SET nombre = ?, descripcion = ?, filtros = ?, activo = 1, updated_at = now_text() WHERE id = ?",
      args: [f.nombre, f.descripcion, JSON.stringify(filtros), id],
    });
    refrescar();
    return { success: true, msg: "Tipo restaurado" };
  } catch (e) {
    console.error("[marketing] restaurarTipo falló:", e);
    return { success: false, msg: "No se pudo restaurar el tipo" };
  }
}

/**
 * Asocia una portada a un tipo (la que se pone sola al generar ese tipo) o la quita (`null`). Es la misma asociación
 * que se edita en Diseños («Portada de»): un tipo tiene una sola portada asociada aquí; para asociar varias o usar
 * otra posición se hace desde Diseños.
 */
export async function asociarPortada(tipoId: string, fijaId: string | null): Promise<ActionResult> {
  if (!(await sesionMarketing())) return { success: false, msg: "Sin permisos" };
  if (!ID_TIPO.test(tipoId)) return { success: false, msg: "Tipo no válido" };
  if (fijaId !== null && !/^[a-z0-9-]{1,80}$/.test(fijaId)) return { success: false, msg: "Portada no válida" };
  try {
    if (!(await tiposCatalogo()).some((t) => t.id === tipoId)) return { success: false, msg: "El tipo no existe" };
    if (fijaId !== null) {
      const f = await db.execute({ sql: "SELECT id FROM mk_paginas_fijas WHERE id = ? AND tipo = 'portada'", args: [fijaId] });
      if (f.rows.length === 0) return { success: false, msg: "La portada no existe" };
    }
    await quitarDeFijas(tipoId);
    if (fijaId !== null) {
      // Se relee tras quitar: la elegida pudo listar ya este tipo (así no se repite).
      const f = await db.execute({ sql: "SELECT auto_tipo FROM mk_paginas_fijas WHERE id = ?", args: [fijaId] });
      const tipos = String(f.rows[0].auto_tipo ?? "").split(",").map((t) => t.trim()).filter(Boolean);
      await db.execute({ sql: "UPDATE mk_paginas_fijas SET auto_tipo = ?, auto_posicion = 'inicio' WHERE id = ?", args: [[...tipos, tipoId].join(","), fijaId] });
    }
    refrescar();
    return { success: true, msg: fijaId ? "Portada asociada" : "Portada quitada" };
  } catch (e) {
    console.error("[marketing] asociarPortada falló:", e);
    return { success: false, msg: "No se pudo asociar la portada" };
  }
}
