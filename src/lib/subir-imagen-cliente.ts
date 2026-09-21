// Envío de UNA imagen ya estandarizada a la API del módulo (navegador).
export type ResultadoEnvio =
  | { ok: true; version: number }
  | { ok: false; error: string };

export async function enviarImagen(
  cod: string,
  png: Blob,
  modo: "nueva" | "reemplazo"
): Promise<ResultadoEnvio> {
  try {
    const res = await fetch(
      `/api/marketing/imagenes?cod=${encodeURIComponent(cod)}&modo=${modo}`,
      { method: "POST", headers: { "Content-Type": "image/png" }, body: png }
    );
    const json = (await res.json().catch(() => null)) as { error?: string; version?: number } | null;
    if (!res.ok) return { ok: false, error: json?.error ?? `Error ${res.status}` };
    return { ok: true, version: json?.version ?? 0 };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor" };
  }
}

export type ResultadoPaginaFija =
  | { ok: true; imagen: string; ancho: number; alto: number }
  | { ok: false; error: string };

/** Reduce una imagen a ≤ 2000 px de ancho y la convierte a WebP para subirla como página completa. */
export async function prepararPaginaFija(archivo: File): Promise<Blob> {
  const bmp = await createImageBitmap(archivo);
  try {
    const escala = Math.min(1, 2000 / bmp.width);
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(bmp.width * escala);
    lienzo.height = Math.round(bmp.height * escala);
    lienzo.getContext("2d")!.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise<Blob | null>((res) => lienzo.toBlob(res, "image/webp", 0.9));
    if (!blob) throw new Error("No se pudo convertir la imagen");
    return blob;
  } finally {
    bmp.close();
  }
}

export async function enviarPaginaFija(imagen: Blob): Promise<ResultadoPaginaFija> {
  try {
    const res = await fetch("/api/marketing/paginas-fijas", {
      method: "POST",
      headers: { "Content-Type": imagen.type || "image/webp" },
      body: imagen,
    });
    const json = (await res.json().catch(() => null)) as { error?: string; imagen?: string; ancho?: number; alto?: number } | null;
    if (!res.ok || !json?.imagen) return { ok: false, error: json?.error ?? `Error ${res.status}` };
    return { ok: true, imagen: json.imagen, ancho: json.ancho ?? 2000, alto: json.alto ?? 1141 };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor" };
  }
}

export type ResultadoDiseno = { ok: true; id: string; reemplazo: boolean } | { ok: false; error: string };

/** Sube un diseño (plantilla de una marca o página fija) ya reducido con `prepararPaginaFija`. */
export async function enviarDiseno(
  imagen: Blob,
  datos: { clase: "plantilla"; marca: string; nombre: string } | { clase: "fija"; tipo: string; nombre: string; aplica: string; posicion: string; /** Solo separadores de marca. */ marca?: string }
): Promise<ResultadoDiseno> {
  try {
    const params = new URLSearchParams(datos as Record<string, string>);
    const res = await fetch(`/api/marketing/disenos?${params}`, {
      method: "POST",
      headers: { "Content-Type": imagen.type || "image/webp" },
      body: imagen,
    });
    const json = (await res.json().catch(() => null)) as { error?: string; id?: string; reemplazo?: boolean } | null;
    if (!res.ok || !json?.id) return { ok: false, error: json?.error ?? `Error ${res.status}` };
    return { ok: true, id: json.id, reemplazo: json.reemplazo === true };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor" };
  }
}
