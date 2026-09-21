// Validación de los datos de filtros que llegan del navegador. Los usan las acciones del servidor (generar un catálogo,
// crear y editar tipos de catálogo); van aquí porque un archivo "use server" solo puede exportar acciones.

const TEXTO_FILTRO = /^[A-Z0-9ÁÉÍÓÚÑ&./ -]{1,40}$/;
/** Tallas del ERP: «9», «9.5», «M», «S/T», «9-10Y», «SIZE 1»… */
const TEXTO_TALLA = /^[A-Z0-9 ./-]{1,16}$/;

function lista(v: unknown, permitido: RegExp, maximo: number): string[] | null {
  if (!Array.isArray(v) || v.length > maximo) return null;
  const salida = new Set<string>();
  for (const x of v) {
    if (typeof x !== "string") return null;
    const t = x.trim().toUpperCase();
    if (!permitido.test(t)) return null;
    salida.add(t);
  }
  return [...salida];
}

/** Lista de valores de filtro (marca, grupo, género, categoría) validada; null si algo no es válido. */
export const valoresFiltro = (v: unknown) => lista(v, TEXTO_FILTRO, 60);

/** Lista de tallas validada; null si algo no es válido. */
export const valoresTalla = (v: unknown) => lista(v, TEXTO_TALLA, 60);

/** Precio válido: número ≥ 0, null si no hay; undefined si es inválido. */
export function precioFiltro(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100_000) return undefined;
  return v;
}
