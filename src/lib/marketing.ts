import { getSession, requireRole, requireModule, type SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

// Base pública del bucket R2 `stock-sc-catalogo`. Hoy es `r2.dev` (sin caché,
// pensado para desarrollo); pasar a dominio propio es cambiar esta variable.
const R2_PUBLIC_URL = (
  process.env.R2_PUBLIC_URL ?? "https://pub-d552bc6cdf204353a02e1f8afd4c87ed.r2.dev"
).replace(/\/+$/, "");

/** Origen del bucket, para `preconnect` (ahorra DNS + TLS en la primera imagen). */
export const ORIGEN_IMAGENES = new URL(R2_PUBLIC_URL).origin;

/** Guard de todas las páginas del módulo MARKETING. */
export async function requireMarketing(): Promise<SessionUser> {
  const session = await requireRole("admin", "administrador_general");
  await requireModule(session, "marketing");
  return session;
}

/**
 * Igual que requireMarketing pero para rutas API y acciones: no redirige,
 * devuelve null si no hay sesión o el usuario no tiene el módulo.
 */
export async function sesionMarketing(): Promise<SessionUser | null> {
  const s = await getSession();
  if (!s || (s.rol !== "admin" && s.rol !== "administrador_general")) return null;
  if (s.rol === "administrador_general") return s;
  const r = await db.execute({
    sql: "SELECT 1 FROM admin_modules WHERE user_id = ? AND module_id = 'marketing'",
    args: [s.id],
  });
  return r.rows.length > 0 ? s : null;
}

/** Enlace público del PNG original, sin parámetros: es lo que se guarda en Neon. */
export function urlPublicaOriginal(codUniversal: string): string {
  return `${R2_PUBLIC_URL}/${encodeURIComponent(codUniversal)}.png`;
}

/**
 * URL para mostrar el PNG original (1600×1600, transparente). `version` solo
 * invalida la caché del navegador tras un reemplazo; R2 ignora el parámetro.
 * Si Neon ya tiene el enlace guardado (`imagenUrl`), se usa ese.
 */
export function urlImagenOriginal(
  codUniversal: string,
  version: number,
  imagenUrl?: string | null
): string {
  return `${imagenUrl || urlPublicaOriginal(codUniversal)}?v=${version}`;
}

/**
 * URL del derivado WebP de 600 px (~20 KB, caché inmutable). Lo genera
 * scripts/marketing_generar_derivados.py; la versión va en el nombre.
 * Si un derivado aún no existe, quien lo muestra debe caer al original.
 */
export function urlImagenMiniatura(codUniversal: string, version: number): string {
  return `${R2_PUBLIC_URL}/derivados/w600/${encodeURIComponent(codUniversal)}.v${version}.webp`;
}
