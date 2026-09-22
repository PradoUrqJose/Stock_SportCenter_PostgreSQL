"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { requireRole } from "@/lib/auth";
import type { ActionResult } from "@/types";
import { guardarComisiones, type ComisionVenta } from "@/lib/comisiones-sync";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function fechaErp(iso: string) { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a}`; }
function validar(inicio: string, fin: string) {
  if (!ISO.test(inicio) || !ISO.test(fin) || inicio > fin) throw new Error("Rango de fechas inválido.");
}
async function urlApi() {
  const h = await headers(); const origen = h.get("x-forwarded-host") ?? h.get("host");
  const host = origen && origen !== process.env.CATALOGOS_HOST ? origen : (process.env.VERCEL_URL ?? origen);
  return `${host ? `https://${host}` : "http://localhost:3000"}/api/comisiones`;
}
async function pedir(inicio: string, fin: string): Promise<ComisionVenta[]> {
  if (!process.env.VERCEL) {
    const { stdout } = await promisify(execFile)(process.env.PYTHON_BIN ?? "python3", [join(process.cwd(), "api", "comisiones.py"), fechaErp(inicio), fechaErp(fin)], { maxBuffer: 64 * 1024 * 1024, timeout: 180_000 });
    return (JSON.parse(stdout) as { ventas: ComisionVenta[] }).ventas;
  }
  const secreto = process.env.SYNC_SECRET; if (!secreto) throw new Error("Falta SYNC_SECRET en las variables de entorno.");
  const res = await fetch(await urlApi(), { method: "POST", headers: { "X-Sync-Secret": secreto, "X-Comisiones-Inicio": fechaErp(inicio), "X-Comisiones-Fin": fechaErp(fin) }, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `El ERP respondió ${res.status}`);
  return body.ventas ?? [];
}
export async function sincronizarComisiones(inicio: string, fin: string): Promise<ActionResult<{ filas: number }>> {
  try {
    const session = await requireRole("admin", "administrador_general"); validar(inicio, fin);
    const ventas = await pedir(inicio, fin);
    const guardado = await guardarComisiones({ inicio, fin, ventas, ejecutadoPor: session.id });
    revalidatePath("/admin/analisis/comisiones");
    return { success: true, msg: `${guardado.filas} ventas Minorista sincronizadas.${guardado.excluidasFj01 ? ` Se excluyeron ${guardado.excluidasFj01} filas FJ01.` : ""}${guardado.repetidas ? ` Se omitieron ${guardado.repetidas} líneas repetidas del ERP.` : ""}`, data: { filas: guardado.filas } };
  } catch (e) { return { success: false, msg: String(e) }; }
}
