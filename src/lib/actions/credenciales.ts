"use server";

import { getSession, isAdminRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "@/types";

const PATH = "/admin/gestion/credenciales";

async function getIP() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

async function guard() {
  const s = await getSession();
  if (!s || !isAdminRole(s.rol)) return null;
  return s;
}

export async function crearVendedor(data: {
  nombre: string;
  codigo: string;
  tienda_id: string;
}): Promise<ActionResult> {
  if (!(await guard())) return { success: false, msg: "Sin permisos" };
  if (!rateLimit(await getIP(), 30, 60_000)) return { success: false, msg: "Demasiadas solicitudes" };

  const nombre = data.nombre.trim();
  const codigo = data.codigo.trim().toUpperCase();
  if (!nombre || !codigo) return { success: false, msg: "Nombre y código son requeridos" };
  if (!data.tienda_id) return { success: false, msg: "Tienda requerida" };

  try {
    await db.execute({
      sql: "INSERT INTO vendedores (nombre, codigo, tienda_id) VALUES (?,?,?)",
      args: [nombre, codigo, data.tienda_id],
    });
  } catch {
    return { success: false, msg: "Ya existe un vendedor con ese código" };
  }

  revalidatePath(PATH);
  return { success: true, msg: "Vendedor creado" };
}

export async function editarVendedor(
  id: number,
  data: {
    nombre: string;
    codigo: string;
    tienda_id: string;
    activo: boolean;
  }
): Promise<ActionResult> {
  if (!(await guard())) return { success: false, msg: "Sin permisos" };
  if (!rateLimit(await getIP(), 30, 60_000)) return { success: false, msg: "Demasiadas solicitudes" };

  const nombre = data.nombre.trim();
  const codigo = data.codigo.trim().toUpperCase();
  if (!nombre || !codigo) return { success: false, msg: "Nombre y código son requeridos" };
  if (!data.tienda_id) return { success: false, msg: "Tienda requerida" };

  try {
    await db.execute({
      sql: "UPDATE vendedores SET nombre=?, codigo=?, tienda_id=?, activo=? WHERE id=?",
      args: [nombre, codigo, data.tienda_id, data.activo ? 1 : 0, id],
    });
  } catch {
    return { success: false, msg: "Ya existe un vendedor con ese código" };
  }

  revalidatePath(PATH);
  return { success: true, msg: "Vendedor actualizado" };
}

export async function eliminarVendedor(id: number): Promise<ActionResult> {
  if (!(await guard())) return { success: false, msg: "Sin permisos" };
  if (!rateLimit(await getIP(), 30, 60_000)) return { success: false, msg: "Demasiadas solicitudes" };

  await db.execute({ sql: "DELETE FROM vendedores WHERE id=?", args: [id] });

  revalidatePath(PATH);
  return { success: true, msg: "Vendedor eliminado" };
}
