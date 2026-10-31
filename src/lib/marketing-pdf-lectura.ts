import { respaldoImagenPdf } from "./marketing-pdf-imagen";

export class PdfCancelado extends Error {
  constructor() {
    super("PDF cancelado");
  }
}

export class ErrorLectura extends Error {
  readonly estado: number;
  constructor(mensaje: string, estado: number) {
    super(mensaje);
    this.estado = estado;
  }
}

const corto = (url: string) => url.replace(/^https?:\/\/[^/]+\//, "");

/** CDN primero; si la red/CORS falla, recuperar la imagen desde nuestro mismo origen. */
export async function bytesDe(
  url: string,
  senal?: AbortSignal,
  recargar = true,
): Promise<Uint8Array> {
  const respaldo = recargar ? respaldoImagenPdf(url) : null;
  let ultimo = "";
  for (let intento = 0; intento < 3; intento++) {
    if (senal?.aborted) throw new PdfCancelado();
    const control = new AbortController();
    const cancelar = () => control.abort();
    senal?.addEventListener("abort", cancelar, { once: true });
    const tiempo = setTimeout(cancelar, 20_000);
    try {
      const r = await fetch(intento > 0 && respaldo ? respaldo : url, {
        signal: control.signal,
        // Evita reutilizar la copia de un <img> que se cargó sin Origin/CORS.
        cache: recargar ? "reload" : "default",
        credentials: "omit",
      });
      if (r.ok) return new Uint8Array(await r.arrayBuffer());
      ultimo = `HTTP ${r.status}`;
      if (r.status !== 429 && r.status < 500)
        throw new ErrorLectura(`No se pudo leer ${corto(url)} (${ultimo})`, r.status);
    } catch (e) {
      if (senal?.aborted) throw new PdfCancelado();
      if (e instanceof ErrorLectura) throw e;
      ultimo = control.signal.aborted
        ? "la descarga de la imagen agotó el tiempo de espera"
        : "falló la conexión al descargar la imagen";
    } finally {
      clearTimeout(tiempo);
      senal?.removeEventListener("abort", cancelar);
    }
    // La primera recuperación por el sitio es inmediata. Solo esperamos al reintentar.
    if (intento < 2 && !(intento === 0 && respaldo))
      await new Promise((r) => setTimeout(r, 400 * (intento + 1)));
  }
  throw new ErrorLectura(`No se pudo leer ${corto(url)} (${ultimo})`, 0);
}
