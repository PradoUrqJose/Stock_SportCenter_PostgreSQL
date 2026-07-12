"use server";

import { requireRole } from "@/lib/auth";
import type { ActionResult } from "@/types";
import type { FacturacionInsert, IngresoInsert } from "@/lib/upload/types";
import {
  uploadFacturacionBatch, finalizeFacturacionUpload,
  uploadIngresosBatch, finalizeIngresosUpload,
} from "@/lib/actions/upload";

type SincronizarResponse = {
  facturacion: FacturacionInsert[];
  ingresos: IngresoInsert[];
};

// La función Python vive en el mismo proyecto Vercel, en api/sincronizar.py.
// OJO: process.env.VERCEL_URL apunta a la URL específica de ESTE deployment
// (ej. stock-5jrj19d4k-...vercel.app), que Vercel protege por defecto con su
// propio SSO — un fetch ahí devuelve un 302 a vercel.com/sso-api y termina en
// HTML, no JSON. VERCEL_PROJECT_PRODUCTION_URL es el dominio estable de
// producción (stock-sc.vercel.app), que no tiene esa protección.
// En local, correr con `vercel dev` (no `next dev`) para que esa ruta exista.
function urlSincronizar(): string {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  const base = host ? `https://${host}` : "http://localhost:3000";
  return `${base}/api/sincronizar`;
}

export async function sincronizarErp(): Promise<
  ActionResult<{ facturacionNuevas: number; ingresosNuevos: number }>
> {
  try {
    await requireRole("admin", "administrador_general");

    const secreto = process.env.SYNC_SECRET;
    if (!secreto) throw new Error("Falta SYNC_SECRET en las variables de entorno.");

    const res = await fetch(urlSincronizar(), {
      method: "POST",
      headers: { "X-Sync-Secret": secreto },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `El scraper respondió ${res.status}`);
    }
    const { facturacion, ingresos }: SincronizarResponse = await res.json();

    const [factRes, ingRes] = await Promise.all([
      uploadFacturacionBatch(facturacion),
      uploadIngresosBatch(ingresos),
    ]);
    if (!factRes.success) throw new Error(`Facturación: ${factRes.msg}`);
    if (!ingRes.success) throw new Error(`Ingresos: ${ingRes.msg}`);

    await Promise.all([
      finalizeFacturacionUpload(facturacion.length),
      finalizeIngresosUpload(ingresos.length),
    ]);

    return {
      success: true,
      msg: `${factRes.data?.insertadas ?? 0} facturas y ${ingRes.data?.insertadas ?? 0} ingresos nuevos`,
      data: {
        facturacionNuevas: factRes.data?.insertadas ?? 0,
        ingresosNuevos: ingRes.data?.insertadas ?? 0,
      },
    };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}
