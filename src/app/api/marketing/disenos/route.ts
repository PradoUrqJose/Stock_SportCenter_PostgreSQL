import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { db } from "@/lib/db";
import { sesionMarketing } from "@/lib/marketing";
import { r2Configurado, r2Subir } from "@/lib/r2";
import { MAX_BYTES_IMAGEN } from "@/lib/marketing-codigos";
import { MARCA_GENERICA } from "@/lib/marketing-catalogo";
import { plantillasGestion } from "@/lib/marketing-catalogos-datos";

export const maxDuration = 30;

const error = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status });
const TIPOS_IMAGEN = new Set(["image/webp", "image/png", "image/jpeg"]);
const TIPOS_FIJA = new Set(["portada", "separador", "cierre", "otra"]);
const ANCHO = 2000;
const CACHE = "public, max-age=31536000, immutable";

/** Minúsculas, sin tildes y con guiones: sirve de parte legible de una ruta o id. */
const slug = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/**
 * POST /api/marketing/disenos — sube un diseño de Marketing.
 *   ?clase=plantilla&marca=NIKE&nombre=Nike Navidad      (marca=* → plantilla genérica)
 *   ?clase=fija&tipo=portada|separador|cierre|otra&nombre=Portada Hombres
 * Cuerpo: la imagen (WebP, PNG o JPEG, hasta 4 MB), en formato 16:9.
 * La plantilla nueva copia las zonas (código, tallas, precio, zapatilla) de la plantilla de referencia:
 * una de la misma marca o, si no hay, la primera activa; se retocan después en «posición de la zapatilla».
 */
export async function POST(req: NextRequest) {
  const sesion = await sesionMarketing();
  if (!sesion) return error("Sin permisos", 403);
  if (!r2Configurado()) return error("R2 no está configurado en el servidor", 503);

  const q = req.nextUrl.searchParams;
  const clase = q.get("clase");
  const nombre = (q.get("nombre") ?? "").trim();
  if (nombre.length < 2 || nombre.length > 60) return error("El nombre debe tener entre 2 y 60 caracteres", 400);

  const tipo = req.headers.get("content-type")?.split(";")[0].trim() ?? "";
  if (!TIPOS_IMAGEN.has(tipo)) return error("La imagen debe ser WebP, PNG o JPEG", 415);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES_IMAGEN) return error("La imagen supera los 4 MB", 413);
  const cuerpo = Buffer.from(await req.arrayBuffer());
  if (cuerpo.length === 0) return error("Cuerpo vacío", 400);
  if (cuerpo.length > MAX_BYTES_IMAGEN) return error("La imagen supera los 4 MB", 413);

  try {
    const meta = await sharp(cuerpo).metadata();
    if (!meta.width || !meta.height || meta.width < 800 || meta.height < 450) return error("La imagen es demasiado pequeña (mínimo 800×450 px)", 422);
    const razon = meta.width / meta.height;
    if (razon < 1.6 || razon > 1.95) return error("El diseño debe ser horizontal en formato 16:9 (por ejemplo 2000×1125)", 422);
    const hash = createHash("sha256").update(cuerpo).digest("hex").slice(0, 8);

    if (clase === "plantilla") {
      const marca = (q.get("marca") ?? "").trim().toUpperCase();
      if (marca !== MARCA_GENERICA && !/^[A-Z0-9 &.-]{1,40}$/.test(marca)) return error("Marca no válida", 400);

      const todas = await plantillasGestion();
      const activas = todas.filter((p) => p.activa);
      const referencia =
        activas.find((p) => p.marca === marca && p.predeterminada) ??
        activas.find((p) => p.marca === marca) ??
        activas.find((p) => p.predeterminada) ??
        activas[0];
      if (!referencia) return error("No hay una plantilla de referencia para copiar las zonas", 409);

      const alto = Math.round((ANCHO * meta.height) / meta.width);
      const parteMarca = marca === MARCA_GENERICA ? "generica" : slug(marca);
      const id = `${parteMarca}-${slug(nombre)}-${hash}`.slice(0, 80);
      const clave = `plantillas/${parteMarca}/${id}`;
      const fondo = sharp(cuerpo).resize(ANCHO, alto);
      await r2Subir(`${clave}.webp`, await fondo.clone().webp({ quality: 84, effort: 5 }).toBuffer(), "image/webp", CACHE);
      await r2Subir(`${clave}.jpg`, await fondo.clone().jpeg({ quality: 88, mozjpeg: true }).toBuffer(), "image/jpeg", CACHE);

      // Sin otra activa en la marca, la nueva pasa a ser la predeterminada.
      const primera = !activas.some((p) => p.marca === marca);
      await db.execute({
        sql: `INSERT INTO mk_plantillas (id, marca, nombre, ancho, alto, fondo_key, zonas, predeterminada, created_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET nombre = excluded.nombre, activa = 1`,
        args: [id, marca, nombre, ANCHO, alto, clave, JSON.stringify(referencia.zonas), primera ? 1 : 0, sesion.id],
      });
      return NextResponse.json({ id, predeterminada: primera });
    }

    if (clase === "fija") {
      const tipoFija = q.get("tipo") ?? "";
      if (!TIPOS_FIJA.has(tipoFija)) return error("Tipo de página no válido", 400);
      const id = `${slug(nombre)}-${hash}`.slice(0, 60);
      const clave = `paginas-fijas/${id}`;
      const { data, info } = await sharp(cuerpo)
        .resize({ width: ANCHO, withoutEnlargement: true })
        .webp({ quality: 86, effort: 5 })
        .toBuffer({ resolveWithObject: true });
      await r2Subir(`${clave}.webp`, data, "image/webp", CACHE);
      await r2Subir(`${clave}-min.webp`, await sharp(cuerpo).resize({ width: 480 }).webp({ quality: 72, effort: 5 }).toBuffer(), "image/webp", CACHE);
      await db.execute({
        sql: `INSERT INTO mk_paginas_fijas (id, nombre, tipo, imagen, ancho, alto, orden)
              VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(orden), 0) + 1 FROM mk_paginas_fijas))
              ON CONFLICT (id) DO UPDATE SET nombre = excluded.nombre, tipo = excluded.tipo, activa = 1`,
        args: [id, nombre, tipoFija, clave, info.width, info.height],
      });
      return NextResponse.json({ id });
    }

    return error("Clase de diseño no válida", 400);
  } catch (e) {
    console.error("[marketing] subir diseño falló:", e);
    return error("No se pudo procesar o guardar el diseño", 500);
  }
}
