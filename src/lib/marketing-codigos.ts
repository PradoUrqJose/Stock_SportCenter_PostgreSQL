// Reglas de código e imagen compartidas por el navegador y el servidor.
// Sin imports de servidor: se usa también desde componentes "use client".

/** Lado (px) de la imagen estandarizada: cuadrada, transparente. */
export const LADO_IMAGEN = 1600;
/** Margen libre alrededor del producto, como fracción del lado. */
export const MARGEN_IMAGEN = 0.08;
/** Tope de un PNG estandarizado. Vercel corta las peticiones en ~4,5 MB. */
export const MAX_BYTES_IMAGEN = 4 * 1024 * 1024;

// Incluye los códigos con espacios del ERP ("FPF 02092"). Nunca carpetas ni segmentos de ruta.
const CODIGO_RE = /^[A-Z0-9][A-Z0-9 ._-]{0,79}$/;

export function normalizarCodigo(valor: string): string {
  return valor.trim().toUpperCase();
}

export function codigoValido(cod: string): boolean {
  return CODIGO_RE.test(cod) && !cod.includes("..");
}

/** "js2322.png" → "JS2322". Devuelve "" si el resultado no es un código válido. */
export function codigoDesdeArchivo(nombre: string): string {
  const cod = normalizarCodigo(nombre.replace(/\.[^.]+$/, ""));
  return codigoValido(cod) ? cod : "";
}
