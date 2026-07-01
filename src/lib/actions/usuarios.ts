"use server";

import { getSession, isAdminRole, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "@/types";

const PATH = "/admin/gestion/usuarios";

async function getIP() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

async function guard() {
  const s = await getSession();
  if (!s || !isAdminRole(s.rol)) return null;
  return s;
}

export async function crearUsuario(data: {
  username: string;
  nombre: string;
  password: string;
  rol: "client" | "admin";
  tienda_id: string | null;
}): Promise<ActionResult> {
  if (!(await guard())) return { success: false, msg: "Sin permisos" };
  if (!rateLimit(await getIP(), 20, 60_000)) return { success: false, msg: "Demasiadas solicitudes" };

  const username = data.username.trim().toLowerCase();
  const nombre = data.nombre.trim();
  if (!username || !nombre) return { success: false, msg: "Usuario y nombre son requeridos" };
  if (!data.password || data.password.length < 6)
    return { success: false, msg: "La contraseña debe tener al menos 6 caracteres" };
  if (data.rol === "client" && !data.tienda_id)
    return { success: false, msg: "El rol Cliente requiere una tienda asignada" };

  const hashed = await hashPassword(data.password);
  try {
    await db.execute({
      sql: `INSERT INTO users (id, username, nombre, password, rol, tienda_id)
            VALUES (?,?,?,?,?,?)`,
      args: [
        crypto.randomUUID(),
        username,
        nombre,
        hashed,
        data.rol,
        data.tienda_id ?? null,
      ],
    });
  } catch {
    return { success: false, msg: "El nombre de usuario ya está en uso" };
  }

  revalidatePath(PATH);
  return { success: true, msg: "Usuario creado" };
}

export async function editarUsuario(
  id: string,
  data: {
    username: string;
    nombre: string;
    password: string;
    rol: "client" | "admin";
    tienda_id: string | null;
    activo: boolean;
  }
): Promise<ActionResult> {
  if (!(await guard())) return { success: false, msg: "Sin permisos" };
  if (!rateLimit(await getIP(), 20, 60_000)) return { success: false, msg: "Demasiadas solicitudes" };

  const username = data.username.trim().toLowerCase();
  const nombre = data.nombre.trim();
  if (!username || !nombre) return { success: false, msg: "Usuario y nombre son requeridos" };
  if (data.rol === "client" && !data.tienda_id)
    return { success: false, msg: "El rol Cliente requiere una tienda asignada" };

  try {
    if (data.password) {
      if (data.password.length < 6)
        return { success: false, msg: "La contraseña debe tener al menos 6 caracteres" };
      const hashed = await hashPassword(data.password);
      await db.execute({
        sql: `UPDATE users SET username=?, nombre=?, password=?, rol=?, tienda_id=?, activo=?
              WHERE id=? AND rol != 'administrador_general'`,
        args: [username, nombre, hashed, data.rol, data.tienda_id ?? null, data.activo ? 1 : 0, id],
      });
    } else {
      await db.execute({
        sql: `UPDATE users SET username=?, nombre=?, rol=?, tienda_id=?, activo=?
              WHERE id=? AND rol != 'administrador_general'`,
        args: [username, nombre, data.rol, data.tienda_id ?? null, data.activo ? 1 : 0, id],
      });
    }
  } catch {
    return { success: false, msg: "El nombre de usuario ya está en uso" };
  }

  revalidatePath(PATH);
  return { success: true, msg: "Usuario actualizado" };
}

export async function eliminarUsuario(id: string): Promise<ActionResult> {
  const session = await guard();
  if (!session) return { success: false, msg: "Sin permisos" };
  if (!rateLimit(await getIP(), 20, 60_000)) return { success: false, msg: "Demasiadas solicitudes" };
  if (id === session.id) return { success: false, msg: "No puedes eliminarte a ti mismo" };

  await db.execute({
    sql: "DELETE FROM users WHERE id=? AND rol != 'administrador_general'",
    args: [id],
  });

  revalidatePath(PATH);
  return { success: true, msg: "Usuario eliminado" };
}
