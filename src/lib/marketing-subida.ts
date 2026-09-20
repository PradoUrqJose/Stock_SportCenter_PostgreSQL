// Guardado de una imagen de producto: R2 primero, Neon después. SOLO servidor.
//
// Orden deliberado (pedido del usuario): el enlace solo llega a la base de
// datos cuando el archivo ya está en R2. Si algo falla antes del paso 5, Neon
// queda intacto. Si fallara el paso 5, el archivo queda en R2 sin registro y
// reintentar es seguro (mismo código, versiones nuevas en el nombre).
//
//   1. validar el PNG (1600×1600, transparente)
//   2. si reemplaza: copiar el original actual a historial/<COD>/<fecha>.png
//   3. subir el PNG original  <COD>.png
//   4. generar y subir los WebP derivados w600 y w1200 (<COD>.v<N>.webp)
//   5. registrar versión y enlace en mk_imagenes (Neon)
import sharp from "sharp";
import { db } from "@/lib/db";
import { r2Copiar, r2Subir } from "@/lib/r2";
import { urlPublicaOriginal } from "@/lib/marketing";
import { LADO_IMAGEN } from "@/lib/marketing-codigos";

export class ErrorSubida extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const CACHE_ORIGINAL = "public, max-age=300, must-revalidate";
const CACHE_DERIVADO = "public, max-age=31536000, immutable";
const ANCHOS_DERIVADOS = [600, 1200] as const;

export type ResultadoSubida = {
  cod_universal: string;
  version: number;
  imagen_url: string;
  reemplazo: boolean;
};

export async function guardarImagen(
  cod: string,
  png: Buffer,
  modo: "nueva" | "reemplazo",
  userId: string
): Promise<ResultadoSubida> {
  // 1. Validación (el navegador ya estandariza, pero la API no confía en él).
  let meta: sharp.Metadata;
  try {
    meta = await sharp(png).metadata();
  } catch {
    throw new ErrorSubida("El archivo no es una imagen válida", 422);
  }
  if (meta.format !== "png" || meta.width !== LADO_IMAGEN || meta.height !== LADO_IMAGEN || !meta.hasAlpha) {
    throw new ErrorSubida(
      `Debe ser un PNG transparente de ${LADO_IMAGEN}×${LADO_IMAGEN} px (llegó ${meta.format} ${meta.width}×${meta.height})`,
      422
    );
  }
  // hasAlpha solo dice que existe el canal: un PNG con fondo blanco sólido también lo tiene.
  if ((await sharp(png).stats()).isOpaque) {
    throw new ErrorSubida("La imagen no tiene fondo transparente", 422);
  }

  const actual = await db.execute({
    sql: "SELECT version FROM mk_imagenes WHERE cod_universal = ?",
    args: [cod],
  });
  const existe = actual.rows.length > 0;
  if (modo === "nueva" && existe) throw new ErrorSubida(`${cod} ya existe; usa «Reemplazar»`, 409);
  if (modo === "reemplazo" && !existe) throw new ErrorSubida(`${cod} no existe todavía`, 404);
  const version = existe ? (actual.rows[0].version as number) + 1 : 1;

  // 2. Historial: el original vigente no se pierde al reemplazar.
  if (existe) {
    const sello = new Date().toISOString().replace(/[:.]/g, "-");
    await r2Copiar(`${cod}.png`, `historial/${cod}/${sello}.png`);
  }

  // 3–4. Original y derivados, en R2.
  await r2Subir(`${cod}.png`, png, "image/png", CACHE_ORIGINAL);
  const derivados = await Promise.all(
    ANCHOS_DERIVADOS.map(async (w) => ({
      w,
      buf: await sharp(png)
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toBuffer(),
    }))
  );
  await Promise.all(
    derivados.map((d) =>
      r2Subir(`derivados/w${d.w}/${cod}.v${version}.webp`, d.buf, "image/webp", CACHE_DERIVADO)
    )
  );

  // 5. Recién ahora, Neon.
  const imagen_url = urlPublicaOriginal(cod);
  await db.execute({
    sql: `INSERT INTO mk_imagenes (cod_universal, version, imagen_url, updated_by)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (cod_universal) DO UPDATE SET
            version = excluded.version,
            imagen_url = excluded.imagen_url,
            updated_by = excluded.updated_by,
            updated_at = now_text()`,
    args: [cod, version, imagen_url, userId],
  });

  return { cod_universal: cod, version, imagen_url, reemplazo: existe };
}
