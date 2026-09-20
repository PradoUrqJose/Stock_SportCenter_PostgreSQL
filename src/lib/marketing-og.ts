// Imagen para la vista previa del enlace (WhatsApp, Facebook, Telegram…): un JPEG de 1200×630 hecho con la primera
// página fija del catálogo (la portada) o, si no hay, con la plantilla de la primera página. WhatsApp no siempre
// muestra bien el WebP, por eso se guarda como JPEG; con la portada entera y un fondo desenfocado de sí misma para
// llenar el formato horizontal sin recortar el texto.
import sharp from "sharp";
import { r2Subir } from "@/lib/r2";
import type { Snapshot } from "@/lib/marketing-catalogo";

const ANCHO = 1200;
const ALTO = 630;

/** Ruta (sin extensión) de la imagen que mejor representa al catálogo. */
function imagenPortada(s: Snapshot): string | null {
  const fija = s.paginas.find((p) => p.tipo === "fija");
  if (fija?.tipo === "fija") return fija.imagen;
  const producto = s.paginas.find((p) => p.tipo === "producto");
  return producto?.tipo === "producto" ? (s.plantillas[producto.plantilla]?.fondo ?? null) : null;
}

/**
 * Genera y sube la imagen de vista previa; devuelve su ruta en el bucket o null si no se pudo (publicar sigue
 * funcionando sin ella: el enlace solo saldría sin imagen en WhatsApp).
 */
export async function generarImagenCompartir(s: Snapshot, slug: string, version: number): Promise<string | null> {
  try {
    const origen = imagenPortada(s);
    if (!origen) return null;
    const res = await fetch(`${s.imagenes_base}/${origen}.webp`, { cache: "no-store" });
    if (!res.ok) return null;
    const original = Buffer.from(await res.arrayBuffer());

    const fondo = await sharp(original).resize(ANCHO, ALTO, { fit: "cover" }).blur(24).modulate({ brightness: 0.8 }).toBuffer();
    const frente = await sharp(original).resize(ANCHO, ALTO, { fit: "inside" }).toBuffer();
    const jpg = await sharp(fondo).composite([{ input: frente, gravity: "centre" }]).jpeg({ quality: 82, mozjpeg: true }).toBuffer();

    const clave = `og/${slug}-v${version}.jpg`;
    await r2Subir(clave, jpg, "image/jpeg", "public, max-age=31536000, immutable");
    return clave;
  } catch (e) {
    console.error("[marketing] no se pudo generar la imagen de vista previa:", e);
    return null;
  }
}
