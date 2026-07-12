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

export async function crearTienda(nombre: string): Promise<ActionResult> {
  if (!(await guard())) return { success: false, msg: "Sin permisos" };
  if (!(await rateLimit(await getIP(), 30, 60_000))) return { success: false, msg: "Demasiadas solicitudes" };

  const n = normalize(nombre);
  if (!n) return { success: false, msg: "Nombre requerido" };
  if (/\s/.test(n)) return { success: false, msg: "El nombre no puede contener espacios" };

  try {
    await db.execute({
      sql: "INSERT INTO tiendas (id, nombre) VALUES (?,?)",
      args: [crypto.randomUUID(), n],
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
  excluida: boolean
): Promise<ActionResult> {
  if (!(await guard())) return { success: false, msg: "Sin permisos" };
  if (!(await rateLimit(await getIP(), 30, 60_000))) return { success: false, msg: "Demasiadas solicitudes" };

  const n = normalize(nombre);
  if (!n) return { success: false, msg: "Nombre requerido" };
  if (/\s/.test(n)) return { success: false, msg: "El nombre no puede contener espacios" };

  try {
    await db.execute({
      sql: "UPDATE tiendas SET nombre=?, excluida_actualizacion=? WHERE id=?",
      args: [n, excluida ? 1 : 0, id],
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
