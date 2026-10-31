/** Solo los recursos públicos que utiliza el PDF; nunca una URL o clave arbitraria. */
export const RUTA_IMAGEN_PDF = "/api/catalogo/imagen";

export function claveImagenPdfValida(clave: string): boolean {
  if (clave.length > 250) return false;
  return /^(?:paginas-fijas\/[A-Za-z0-9-]{8,100}\.webp|plantillas\/[a-z0-9-]{1,80}\/[a-z0-9-]{1,120}\.jpg|derivados\/w1200\/[A-Z0-9][A-Z0-9._ -]{0,79}\.webp)$/.test(clave);
}

export function respaldoImagenPdf(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    const clave = decodeURIComponent(u.pathname.slice(1));
    if (!claveImagenPdfValida(clave)) return null;
    const q = new URLSearchParams({ clave });
    const revision = u.searchParams.get("v");
    if (revision && /^\d{1,15}$/.test(revision)) q.set("v", revision);
    return `${RUTA_IMAGEN_PDF}?${q}`;
  } catch {
    return null;
  }
}
