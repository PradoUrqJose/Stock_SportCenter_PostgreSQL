import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { db } from "@/lib/db";
import { sesionMarketing } from "@/lib/marketing";
import { r2Configurado, r2Subir } from "@/lib/r2";
import { MAX_BYTES_IMAGEN } from "@/lib/marketing-codigos";
import { MARCA_GENERICA } from "@/lib/marketing-catalogo";
import { idsDeTipos } from "@/lib/marketing-tipos";
import { plantillasGestion } from "@/lib/marketing-catalogos-datos";
import { claveNombre } from "@/lib/marketing-disenos-nombres";

export const maxDuration = 30;

const error = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status });
const TIPOS_IMAGEN = new Set(["image/webp", "image/png", "image/jpeg"]);
const TIPOS_FIJA = new Set(["portada", "separador", "separador_marca", "cierre", "otra"]);
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
 *   ?clase=fija&tipo=portada|separador|cierre|otra&nombre=Portada Hombres&aplica=hombre,mujer|*&posicion=inicio|final
 *      (aplica y posicion vacíos = página a mano; con aplica y sin posicion = solo se sugiere en esos catálogos)
 *   ?clase=fija&tipo=separador_marca&marca=ADIDAS&nombre=Separador Adidas
 *      (uno por marca: si esa marca ya tiene separador, se reemplaza su imagen; no lleva aplica ni posicion)
 * Si ya existe un diseño con ese nombre (y la misma marca o tipo), se REEMPLAZA su imagen y se conserva lo demás.
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
      // Mismo nombre y marca = se reemplaza el fondo de esa plantilla (conserva sus zonas y si es la predeterminada).
      const existente = todas.find((p) => p.marca === marca && claveNombre(p.nombre) === claveNombre(nombre));
      const id = existente?.id ?? `${parteMarca}-${slug(nombre)}-${hash}`.slice(0, 80);
      const clave = `plantillas/${parteMarca}/${slug(nombre)}-${hash}`;
      const fondo = sharp(cuerpo).resize(ANCHO, alto);
      await r2Subir(`${clave}.webp`, await fondo.clone().webp({ quality: 84, effort: 5 }).toBuffer(), "image/webp", CACHE);
      await r2Subir(`${clave}.jpg`, await fondo.clone().jpeg({ quality: 88, mozjpeg: true }).toBuffer(), "image/jpeg", CACHE);

      if (existente) {
        await db.execute({ sql: "UPDATE mk_plantillas SET fondo_key = ?, ancho = ?, alto = ?, activa = 1 WHERE id = ?", args: [clave, ANCHO, alto, id] });
        return NextResponse.json({ id, reemplazo: true });
      }
      // Sin otra activa en la marca, la nueva pasa a ser la predeterminada.
      const primera = !activas.some((p) => p.marca === marca);
      await db.execute({
        sql: `INSERT INTO mk_plantillas (id, marca, nombre, ancho, alto, fondo_key, zonas, predeterminada, created_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, marca, nombre, ANCHO, alto, clave, JSON.stringify(referencia.zonas), primera ? 1 : 0, sesion.id],
      });
      return NextResponse.json({ id, predeterminada: primera, reemplazo: false });
    }

    if (clase === "fija") {
      const tipoFija = q.get("tipo") ?? "";
      if (!TIPOS_FIJA.has(tipoFija)) return error("Tipo de página no válido", 400);
      const deMarca = tipoFija === "separador_marca";
      const marcaFija = (q.get("marca") ?? "").trim().toUpperCase();
      if (deMarca && !/^[A-Z0-9 &.'-]{1,40}$/.test(marcaFija)) return error("Marca no válida", 400);
      const aplica = deMarca ? [] : (q.get("aplica") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
      const tiposValidos = new Set([...(await idsDeTipos()), "*"]);
      if (!aplica.every((t) => tiposValidos.has(t))) return error("Tipo de catálogo no válido", 400);
      const posicion = deMarca ? "" : (q.get("posicion") ?? "");
      if (!["", "inicio", "final"].includes(posicion)) return error("Posición no válida", 400);
      if (posicion !== "" && aplica.length === 0) return error("Elige en qué catálogos se usa antes de fijar su posición", 400);

      // Mismo diseño = mismo nombre sin contar tildes, mayúsculas ni símbolos.
      // El separador de marca es único por marca (con cualquier nombre).
      const delTipo = await db.execute({ sql: "SELECT id, nombre, marca, auto_tipo, auto_posicion FROM mk_paginas_fijas WHERE tipo = ?", args: [tipoFija] });
      const previa = delTipo.rows.find((r) => (deMarca ? (r.marca as string | null) === marcaFija : claveNombre(r.nombre as string) === claveNombre(nombre)));
      const existente = { rows: previa ? [previa] : [] };
      const id = (previa?.id as string | undefined) ?? (deMarca ? `separador-${slug(marcaFija)}-${hash}` : `${slug(nombre)}-${hash}`).slice(0, 60);
      const clave = `paginas-fijas/${deMarca ? `separador-${slug(marcaFija)}` : slug(nombre)}-${hash}`;
      const { data, info } = await sharp(cuerpo)
        .resize({ width: ANCHO, withoutEnlargement: true })
        .webp({ quality: 86, effort: 5 })
        .toBuffer({ resolveWithObject: true });
      await r2Subir(`${clave}.webp`, data, "image/webp", CACHE);
      await r2Subir(`${clave}-min.webp`, await sharp(cuerpo).resize({ width: 480 }).webp({ quality: 72, effort: 5 }).toBuffer(), "image/webp", CACHE);
      const fija = { id, nombre: (previa?.nombre as string | undefined) ?? nombre, tipo: tipoFija, imagen: clave, ancho: info.width, alto: info.height, auto_tipo: (previa?.auto_tipo as string | null | undefined) ?? (aplica.length > 0 ? aplica.join(",") : null), auto_posicion: (previa?.auto_posicion as string | null | undefined) ?? (posicion || null), marca: deMarca ? marcaFija : null };

      if (existente.rows.length > 0) {
        // Reemplazo: solo cambia la imagen; dónde se usa y su posición se conservan.
        await db.execute({ sql: "UPDATE mk_paginas_fijas SET imagen = ?, ancho = ?, alto = ?, activa = 1 WHERE id = ?", args: [clave, info.width, info.height, id] });
        return NextResponse.json({ id, reemplazo: true, fija });
      }
      await db.execute({
        sql: `INSERT INTO mk_paginas_fijas (id, nombre, tipo, imagen, ancho, alto, auto_tipo, auto_posicion, marca, orden)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(orden), 0) + 1 FROM mk_paginas_fijas))`,
        args: [id, nombre, tipoFija, clave, info.width, info.height, aplica.length > 0 ? aplica.join(",") : null, posicion || null, deMarca ? marcaFija : null],
      });
      return NextResponse.json({ id, reemplazo: false, fija });
    }

    return error("Clase de diseño no válida", 400);
  } catch (e) {
    console.error("[marketing] subir diseño falló:", e);
    return error("No se pudo procesar o guardar el diseño", 500);
  }
}
