"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { sesionMarketing } from "@/lib/marketing";
import { rateLimit } from "@/lib/rate-limit";
import {
  crearRevisionImagenes,
  ejecutarRevisionImagenes,
  estadoRevisionImagen,
  type EstadoRevisionImagen,
} from "@/lib/marketing-revision-imagenes";
import type { ActionResult } from "@/types";

export async function iniciarRevisionImagenes(): Promise<
  ActionResult<{ id: string }>
> {
  const sesion = await sesionMarketing();
  if (!sesion) return { success: false, msg: "Sin permisos" };
  if (!(await rateLimit(`mk-revision-imagenes:${sesion.id}`, 3, 300_000)))
    return {
      success: false,
      msg: "Espera unos minutos antes de volver a consultar el ERP",
    };
  try {
    const r = await crearRevisionImagenes(sesion.id);
    const h = await headers();
    const origen = h.get("x-forwarded-host") ?? h.get("host") ?? undefined;
    if (r.nueva) after(() => ejecutarRevisionImagenes(r.id, origen));
    return {
      success: true,
      msg: r.nueva ? "Consultando el ERP" : "Ya hay una consulta en curso",
      data: { id: r.id },
    };
  } catch (e) {
    console.error("[marketing] iniciar revisión de imágenes:", e);
    return {
      success: false,
      msg: "No se pudo iniciar la revisión de imágenes",
    };
  }
}

export async function consultarEstadoRevisionImagenes(
  id: string,
): Promise<ActionResult<EstadoRevisionImagen>> {
  if (!(await sesionMarketing()))
    return { success: false, msg: "Sin permisos" };
  if (!/^[a-f0-9-]{36}$/i.test(id))
    return { success: false, msg: "Consulta inválida" };
  const estado = await estadoRevisionImagen(id);
  return estado
    ? { success: true, msg: "", data: estado }
    : { success: false, msg: "La consulta no existe" };
}
