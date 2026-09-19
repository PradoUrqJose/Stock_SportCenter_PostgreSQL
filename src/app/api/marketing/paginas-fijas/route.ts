import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { sesionMarketing } from "@/lib/marketing";
import { r2Configurado, r2Subir } from "@/lib/r2";
import { MAX_BYTES_IMAGEN } from "@/lib/marketing-codigos";

export const maxDuration = 30;

const error = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status });
const TIPOS = new Set(["image/webp", "image/png", "image/jpeg"]);
const ANCHO_MAX = 2000;

/**
 * POST /api/marketing/paginas-fijas — sube la imagen de una página completa
 * (portada, divisor, redes…) para agregarla a un catálogo desde el editor.
 * Cuerpo: la imagen (webp/png/jpeg, hasta 4 MB). Se guarda como WebP de hasta
 * 2000 px de ancho en R2 (`paginas-fijas/<id>.webp`, caché inmutable) y se
 * devuelve su ruta y tamaño; la página se registra al guardar el borrador.
 */
export async function POST(req: NextRequest) {
  if (!(await sesionMarketing())) return error("Sin permisos", 403);
  if (!r2Configurado()) return error("R2 no está configurado en el servidor", 503);

  const tipo = req.headers.get("content-type")?.split(";")[0].trim() ?? "";
  if (!TIPOS.has(tipo)) return error("La imagen debe ser WebP, PNG o JPEG", 415);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES_IMAGEN) return error("La imagen supera los 4 MB", 413);

  const cuerpo = Buffer.from(await req.arrayBuffer());
  if (cuerpo.length === 0) return error("Cuerpo vacío", 400);
  if (cuerpo.length > MAX_BYTES_IMAGEN) return error("La imagen supera los 4 MB", 413);

  try {
    const meta = await sharp(cuerpo).metadata();
    if (!meta.width || !meta.height || meta.width < 200 || meta.height < 200) {
      return error("La imagen es demasiado pequeña (mínimo 200×200 px)", 422);
    }
    const { data, info } = await sharp(cuerpo)
      .resize({ width: ANCHO_MAX, withoutEnlargement: true })
      .webp({ quality: 88, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    const imagen = `paginas-fijas/${randomUUID()}`;
    await r2Subir(`${imagen}.webp`, data, "image/webp", "public, max-age=31536000, immutable");
    return NextResponse.json({ imagen, ancho: info.width, alto: info.height });
  } catch (e) {
    console.error("[marketing] subir página fija falló:", e);
    return error("No se pudo procesar o guardar la imagen", 500);
  }
}
