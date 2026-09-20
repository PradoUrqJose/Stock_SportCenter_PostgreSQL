// Estandarizado de imágenes en el NAVEGADOR (canvas), antes de subirlas.
// Misma regla que EstandarizacionImagenes y que el lote de las 3573 imágenes:
// recortar al producto real (alpha > 10), ajustarlo al área útil y centrarlo en
// un lienzo cuadrado transparente con margen fijo. Así una imagen nueva queda
// con la misma proporción visual que el resto del catálogo.
import { LADO_IMAGEN, MARGEN_IMAGEN, MAX_BYTES_IMAGEN } from "./marketing-codigos";

const ALPHA_MIN = 10;
const MAX_ARCHIVO_ORIGEN = 30 * 1024 * 1024;
const MAX_LADO_ORIGEN = 8000; // getImageData de 8000² ya pesa ~256 MB
const MIN_LADO_PRODUCTO = 500; // por debajo el producto se vería pixelado

export type ImagenEstandarizada = {
  blob: Blob;
  /** URL temporal para previsualizar; quien la use debe revocarla. */
  vistaPrevia: string;
  /** Avisos que no impiden subirla (ej. resolución baja). */
  avisos: string[];
};

export class ErrorImagen extends Error {}

export async function estandarizarImagen(archivo: File): Promise<ImagenEstandarizada> {
  if (archivo.type !== "image/png" && archivo.type !== "image/webp") {
    throw new ErrorImagen("Solo PNG o WebP con fondo transparente");
  }
  if (archivo.size > MAX_ARCHIVO_ORIGEN) {
    throw new ErrorImagen("El archivo supera los 30 MB");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(archivo);
  } catch {
    throw new ErrorImagen("No se pudo leer la imagen (¿archivo dañado?)");
  }

  try {
    const { width: w, height: h } = bitmap;
    if (Math.max(w, h) > MAX_LADO_ORIGEN) {
      throw new ErrorImagen(`La imagen es demasiado grande (${w}×${h})`);
    }

    const origen = document.createElement("canvas");
    origen.width = w;
    origen.height = h;
    const ctxO = origen.getContext("2d", { willReadFrequently: true })!;
    ctxO.drawImage(bitmap, 0, 0);
    const { data } = ctxO.getImageData(0, 0, w, h);

    // Caja del producto y detección de imagen opaca (sin fondo quitado).
    let x0 = w, y0 = h, x1 = -1, y1 = -1, hayTransparencia = false;
    for (let y = 0; y < h; y++) {
      const fila = y * w;
      for (let x = 0; x < w; x++) {
        const a = data[(fila + x) * 4 + 3];
        if (a < 250) hayTransparencia = true;
        if (a > ALPHA_MIN) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) throw new ErrorImagen("La imagen está vacía (todo transparente)");
    if (!hayTransparencia) {
      throw new ErrorImagen("No tiene fondo transparente: quítale el fondo antes de subirla");
    }

    const cropW = x1 - x0 + 1;
    const cropH = y1 - y0 + 1;
    const avisos: string[] = [];
    if (Math.max(cropW, cropH) < MIN_LADO_PRODUCTO) {
      avisos.push(`Resolución baja (${cropW}×${cropH} px): se verá pixelada`);
    }

    const escala = (LADO_IMAGEN * (1 - 2 * MARGEN_IMAGEN)) / Math.max(cropW, cropH);
    const nw = Math.max(1, Math.round(cropW * escala));
    const nh = Math.max(1, Math.round(cropH * escala));

    const destino = document.createElement("canvas");
    destino.width = LADO_IMAGEN;
    destino.height = LADO_IMAGEN;
    const ctxD = destino.getContext("2d")!;
    ctxD.imageSmoothingEnabled = true;
    ctxD.imageSmoothingQuality = "high";
    ctxD.drawImage(
      origen, x0, y0, cropW, cropH,
      Math.round((LADO_IMAGEN - nw) / 2), Math.round((LADO_IMAGEN - nh) / 2), nw, nh
    );

    const blob = await new Promise<Blob | null>((res) => destino.toBlob(res, "image/png"));
    if (!blob) throw new ErrorImagen("No se pudo generar el PNG");
    if (blob.size > MAX_BYTES_IMAGEN) {
      throw new ErrorImagen(
        `El PNG resultante pesa ${(blob.size / 1048576).toFixed(1)} MB (máximo ${MAX_BYTES_IMAGEN / 1048576} MB)`
      );
    }
    return { blob, vistaPrevia: URL.createObjectURL(blob), avisos };
  } finally {
    bitmap.close();
  }
}
