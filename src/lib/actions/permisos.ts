"use server";

import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "@/types";

const PATH = "/admin/gestion/permisos";

async function getIP() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

async function guard() {
  const s = await getSession();
  if (!s || s.rol !== "administrador_general") return null;
  return s;
}

export async function toggleModulo(
  userId: string,
  moduleId: string,
  granted: boolean
): Promise<ActionResult> {
  if (!(await guard())) return { success: false, msg: "Sin permisos" };
  if (!(await rateLimit(await getIP(), 60, 60_000))) return { success: false, msg: "Demasiadas solicitudes" };

  if (granted) {
    await db.execute({
      sql: "INSERT INTO admin_modules (user_id, module_id) VALUES (?,?) ON CONFLICT DO NOTHING",
      args: [userId, moduleId],
    });
  } else {
    await db.execute({
      sql: "DELETE FROM admin_modules WHERE user_id=? AND module_id=?",
      args: [userId, moduleId],
    });
  }

  revalidatePath(PATH);
  return { success: true, msg: granted ? "Módulo otorgado" : "Módulo revocado" };
}
