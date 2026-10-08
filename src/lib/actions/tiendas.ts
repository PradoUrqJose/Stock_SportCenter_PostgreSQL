"use server";

import { getSession, isAdminRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "@/types";

const PATH = "/admin/gestion/tiendas";

async function getIP() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

async function guard() {
  const s = await getSession();
  if (!s || !isAdminRole(s.rol)) return null;
  return s;
}

function normalize(nombre: string) {
  return nombre.trim().toUpperCase();
}

export async function crearTienda(nombre: string, tipo: "tienda" | "almacen" = "tienda"): Promise<ActionResult> {
  if (!(await guard())) return { success: false, msg: "Sin permisos" };
  if (!(await rateLimit(await getIP(), 30, 60_000))) return { success: false, msg: "Demasiadas solicitudes" };

  const n = normalize(nombre);
  if (!n) return { success: false, msg: "Nombre requerido" };
  if (/\s/.test(n)) return { success: false, msg: "El nombre no puede contener espacios" };

  try {
    await db.execute({
      sql: "INSERT INTO tiendas (id, nombre, tipo, excluida_actualizacion) VALUES (?,?,?,?)",
      args: [crypto.randomUUID(), n, tipo, tipo === "almacen" ? 1 : 0],
    });
  } catch {
    return { success: false, msg: "Ya existe una tienda con ese nombre" };
  }

  revalidatePath(PATH);
  return { success: true, msg: "Tienda creada" };
}

export async function editarTienda(
  id: string,
  nombre: string,
  excluida: boolean,
  tipo: "tienda" | "almacen" = "tienda"
): Promise<ActionResult> {
  if (!(await guard())) return { success: false, msg: "Sin permisos" };
  if (!(await rateLimit(await getIP(), 30, 60_000))) return { success: false, msg: "Demasiadas solicitudes" };

  const n = normalize(nombre);
  if (!n) return { success: false, msg: "Nombre requerido" };
  if (/\s/.test(n)) return { success: false, msg: "El nombre no puede contener espacios" };

  try {
    const old = await db.execute({ sql: "SELECT nombre FROM tiendas WHERE id=?", args: [id] });
    const previous = old.rows[0]?.nombre as string | undefined;
    if (previous && previous !== n) {
      const active = await db.execute({ sql: "SELECT 1 FROM traslados WHERE estado<>'recibido' AND (origen=? OR destino=?) LIMIT 1", args: [previous, previous] });
      if (active.rows.length) return { success: false, msg: "No se puede renombrar una sede con traslados activos" };
    }
    await db.execute({
      sql: "UPDATE tiendas SET nombre=?, excluida_actualizacion=?, tipo=? WHERE id=?",
      args: [n, excluida ? 1 : 0, tipo, id],
    });
  } catch {
    return { success: false, msg: "Ya existe una tienda con ese nombre" };
  }

  revalidatePath(PATH);
  return { success: true, msg: "Tienda actualizada" };
}

export async function toggleLoteExclusion(
  tiendaId: string,
  loteId: number,
  excluir: boolean
): Promise<ActionResult> {
  const s = await guard();
  if (!s) return { success: false, msg: "Sin permisos" };
  if (!(await rateLimit(await getIP(), 60, 60_000))) return { success: false, msg: "Demasiadas solicitudes" };

  try {
    if (excluir) {
      await db.execute({
        sql: `INSERT INTO lote_exclusiones (lote_id, tienda_id, excluida_by) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
        args: [loteId, tiendaId, s.id],
      });
    } else {
      await db.execute({
        sql: `DELETE FROM lote_exclusiones WHERE lote_id = ? AND tienda_id = ?`,
        args: [loteId, tiendaId],
      });
    }
  } catch {
    return { success: false, msg: "Error al actualizar exclusión del lote" };
  }

  revalidatePath(PATH);
  return { success: true, msg: excluir ? "Excluida del lote" : "Incluida en el lote" };
}

export async function eliminarTienda(id: string): Promise<ActionResult> {
  if (!(await guard())) return { success: false, msg: "Sin permisos" };
  if (!(await rateLimit(await getIP(), 30, 60_000))) return { success: false, msg: "Demasiadas solicitudes" };

  try {
    const current = await db.execute({ sql: "SELECT nombre FROM tiendas WHERE id=?", args: [id] });
    const nombre = current.rows[0]?.nombre as string | undefined;
    if (nombre) {
      const active = await db.execute({ sql: "SELECT 1 FROM traslados WHERE estado<>'recibido' AND (origen=? OR destino=?) LIMIT 1", args: [nombre, nombre] });
      if (active.rows.length) return { success: false, msg: "No se puede eliminar una sede con traslados activos" };
    }
    await db.execute({ sql: "DELETE FROM tiendas WHERE id=?", args: [id] });
  } catch {
    return {
      success: false,
      msg: "No se puede eliminar: hay usuarios o vendedores vinculados",
    };
  }

  revalidatePath(PATH);
  return { success: true, msg: "Tienda eliminada" };
}
