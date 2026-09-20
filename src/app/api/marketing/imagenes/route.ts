import { NextRequest, NextResponse } from "next/server";
import { sesionMarketing } from "@/lib/marketing";
import { r2Configurado } from "@/lib/r2";
import { ErrorSubida, guardarImagen } from "@/lib/marketing-subida";
import { codigoValido, normalizarCodigo, MAX_BYTES_IMAGEN } from "@/lib/marketing-codigos";

// Sharp + dos subidas a R2 + Neon por imagen: holgado, pero > 10 s por defecto de Hobby.
export const maxDuration = 30;

const error = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status });

/**
 * POST /api/marketing/imagenes?cod=<CODIGO>&modo=nueva|reemplazo
 * Cuerpo: el PNG estandarizado (image/png). Una imagen por petición: la carga
 * masiva las envía una a una desde el navegador.
 */
export async function POST(req: NextRequest) {
  const sesion = await sesionMarketing();
  if (!sesion) return error("Sin permisos", 403);
  if (!r2Configurado()) return error("R2 no está configurado en el servidor", 503);

  const cod = normalizarCodigo(req.nextUrl.searchParams.get("cod") ?? "");
  if (!codigoValido(cod)) return error("Código de producto inválido", 400);

  const modo = req.nextUrl.searchParams.get("modo");
  if (modo !== "nueva" && modo !== "reemplazo") return error("Falta el parámetro modo", 400);

  if (req.headers.get("content-type")?.split(";")[0].trim() !== "image/png") {
    return error("El cuerpo debe ser image/png", 415);
  }
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > MAX_BYTES_IMAGEN) return error("La imagen supera los 4 MB", 413);

  const png = Buffer.from(await req.arrayBuffer());
  if (png.length === 0) return error("Cuerpo vacío", 400);
  if (png.length > MAX_BYTES_IMAGEN) return error("La imagen supera los 4 MB", 413);

  try {
    return NextResponse.json(await guardarImagen(cod, png, modo, sesion.id));
  } catch (e) {
    if (e instanceof ErrorSubida) return error(e.message, e.status);
    console.error(`[marketing] guardarImagen(${cod}) falló:`, e);
    return error("No se pudo guardar la imagen (revisa R2 y la base de datos)", 500);
  }
}
