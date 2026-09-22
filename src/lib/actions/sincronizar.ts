"use server";

import { requireRole } from "@/lib/auth";
import { headers } from "next/headers";
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
// propio SSO. Tampoco se usa VERCEL_PROJECT_PRODUCTION_URL: ahora puede ser el
// dominio de catálogos públicos, que sólo sirve /<enlace> y no las rutas API.
// Se llama al mismo host administrativo que recibió la acción, igual que el
// scraper de Marketing. Sólo se usa en Vercel: en local se ejecuta el script
// (ver scrapearEnLocal).
async function urlSincronizar(): Promise<string> {
  const requestHeaders = await headers();
  const origen = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const host = origen && origen !== process.env.CATALOGOS_HOST
    ? origen
    : (process.env.VERCEL_URL ?? origen);
  const base = host ? `https://${host}` : "http://localhost:3000";
  return `${base}/api/sincronizar`;
}

// Fuera de Vercel no existe la ruta /api/sincronizar: `next dev` no conoce
// api/*.py y `vercel dev` tampoco la construye (delega todo a next dev), así
// que un fetch ahí da 404 o "fetch failed". En local se ejecuta el mismo
// archivo como script y se lee el JSON de su stdout — no hace falta servidor
// aparte ni SYNC_SECRET, porque el requireRole de arriba ya autorizó.
async function scrapearEnLocal(): Promise<SincronizarResponse> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { join } = await import("node:path");
  const script = join(process.cwd(), "api", "sincronizar.py");
  const { stdout } = await promisify(execFile)(
    process.env.PYTHON_BIN ?? "python3",
    [script, "--json"],
    // El JSON ronda 600 KB y el scrape tarda ~20s; los defaults (1 MB, sin
    // timeout) quedan justos.
    { maxBuffer: 64 * 1024 * 1024, timeout: 180_000 }
  );
  return JSON.parse(stdout);
}

async function pedirDatos(): Promise<SincronizarResponse> {
  if (!process.env.VERCEL) return scrapearEnLocal();

  const secreto = process.env.SYNC_SECRET;
  if (!secreto) throw new Error("Falta SYNC_SECRET en las variables de entorno.");

  const res = await fetch(await urlSincronizar(), {
    method: "POST",
    headers: { "X-Sync-Secret": secreto },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `El scraper respondió ${res.status}`);
  }
  return res.json();
}

export async function sincronizarErp(): Promise<
  ActionResult<{ facturacionNuevas: number; ingresosNuevos: number }>
> {
  try {
    await requireRole("admin", "administrador_general");

    const { facturacion, ingresos } = await pedirDatos();

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

    const corregidas = factRes.data?.corregidas ?? 0;
    return {
      success: true,
      msg:
        `${factRes.data?.insertadas ?? 0} facturas y ${ingRes.data?.insertadas ?? 0} ingresos nuevos` +
        (corregidas > 0 ? ` (${corregidas} facturas con la fecha corregida)` : ""),
      data: {
        facturacionNuevas: factRes.data?.insertadas ?? 0,
        ingresosNuevos: ingRes.data?.insertadas ?? 0,
      },
    };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}
