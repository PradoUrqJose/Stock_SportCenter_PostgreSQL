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

/** Fecha ISO (YYYY-MM-DD) del filtro «Fecha Min. de Ingreso»; null si está vacía, undefined si no es una fecha real. */
export function fechaIngresoFiltro(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const [anio, mes, dia] = v.split("-").map(Number);
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  return f.toISOString().slice(0, 10) === v ? v : undefined;
}

/** Stock mínimo ERP (Stock >=): entero positivo. Vacío conserva el mínimo actual del ERP: 1. */
export function stockMinimoFiltro(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return 1;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : undefined;
}
