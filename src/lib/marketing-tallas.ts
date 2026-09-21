// Equivalencia de tallas (lógica PURA, sin BD ni red): el ERP entrega la talla en escala USA; los catálogos salen por
// defecto con la talla PERUANA. La equivalencia se define por marca y género (cada marca calza distinto):
//   ADIDAS · HOMBRE: USA 8 → Perú 41.5, USA 9 → Perú 42.5 …
// Solo se convierten tallas de CALZADO (8, 10.5, 1Y…); la ropa (S, M, XL), los rangos («11-12Y») y lo demás no se tocan.
// Lo que no tenga equivalencia sale con la talla USA y se AVISA (nunca se cambia una talla por otra en silencio).
import type { ProductoCat } from "./marketing-catalogo";

export type EscalaTalla = "peru" | "usa";

/** Una fila de la tabla de una marca y género. */
export type FilaTalla = {
  /** Talla USA normalizada (`claveUsa`): «8», «10.5», «1». */
  usa: string;
  /** Talla peruana. */
  peru: number;
  /** Largo del pie en cm (dato de referencia, no se muestra en el catálogo). */
  pie_cm: number | null;
};

export type TablaTallas = { marca: string; genero: string; filas: FilaTalla[] };

/** Géneros que usa el ERP. */
export const GENEROS_TALLAS = ["HOMBRE", "MUJER", "JUNIOR", "PRESCO", "INFANTE", "UNISEX"] as const;

/** Nombres con los que las marcas llaman a los géneros del ERP. */
const ALIAS_GENERO: Record<string, string> = {
  DAMA: "MUJER",
  DAMAS: "MUJER",
  MUJERES: "MUJER",
  HOMBRES: "HOMBRE",
  VARON: "HOMBRE",
  "PRE ESCOLAR": "PRESCO",
  "PRE-ESCOLAR": "PRESCO",
  PREESCOLAR: "PRESCO",
  "PRE ESCOLARES": "PRESCO",
  JUNIORS: "JUNIOR",
};

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** El género como lo llama el ERP: «DAMA» → MUJER, «PRE ESCOLAR» → PRESCO. Un nombre desconocido se devuelve en mayúsculas. */
export function generoCanonico(g: string): string {
  const t = sinTildes(g).trim().replace(/\s+/g, " ").toUpperCase();
  return ALIAS_GENERO[t] ?? t;
}

export const esGeneroConocido = (g: string) => (GENEROS_TALLAS as readonly string[]).includes(generoCanonico(g));

/** La marca como la escribe el ERP: mayúsculas y espacios simples. */
export const marcaCanonica = (m: string): string => m.trim().replace(/\s+/g, " ").toUpperCase();

/**
 * Talla USA de calzado normalizada, o null si no lo es. «8.0» → «8», «10,5» → «10.5», «1Y» → «1» (la Y de «youth» no
 * distingue nada dentro de una tabla de género). Ropa («S», «XL»), rangos («11-12Y») y «OSFA» dan null.
 */
export function claveUsa(talla: string): string | null {
  const m = /^(\d{1,2}(?:[.,]\d)?)\s*[YC]?$/i.exec(talla.trim());
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? String(n) : null;
}

/** «27», «27.5»: sin ceros de más. */
export const etiquetaPeru = (n: number): string => String(Math.round(n * 10) / 10);

// ---------- índice para convertir ----------
/** `marca|GÉNERO` → (talla USA normalizada → talla peruana). */
export type IndiceTallas = Map<string, Map<string, number>>;

export function indexarTallas(tablas: readonly { marca: string; genero: string; filas: readonly { usa: string; peru: number }[] }[]): IndiceTallas {
  const idx: IndiceTallas = new Map();
  for (const t of tablas) {
    const k = `${marcaCanonica(t.marca)}|${generoCanonico(t.genero)}`;
    const m = idx.get(k) ?? new Map<string, number>();
    for (const f of t.filas) m.set(f.usa, f.peru);
    idx.set(k, m);
  }
  return idx;
}

/** La tabla de una marca y género; los UNISEX usan la de HOMBRE si no tienen una propia. */
export function tablaDe(idx: IndiceTallas, marca: string, genero: string): { tabla: Map<string, number>; via?: string } | null {
  const m = marcaCanonica(marca);
  const g = generoCanonico(genero);
  const propia = idx.get(`${m}|${g}`);
  if (propia) return { tabla: propia };
  if (g === "UNISEX") {
    const hombre = idx.get(`${m}|HOMBRE`);
    if (hombre) return { tabla: hombre, via: "UNISEX usa la tabla de HOMBRE" };
  }
  return null;
}

export type AvisoTallas = {
  marca: string;
  genero: string;
  /** Productos afectados. */
  productos: number;
  /** «sin_tabla»: la marca y género no tienen equivalencia; «tallas_faltantes»: la tabla existe pero le faltan estas tallas USA. */
  motivo: "sin_tabla" | "tallas_faltantes";
  /** Solo en «tallas_faltantes»: las tallas USA que no están en la tabla. */
  tallas?: string[];
};

const ordenNumerico = (a: string, b: string) => {
  const x = parseFloat(a), y = parseFloat(b);
  return Number.isNaN(x) || Number.isNaN(y) ? a.localeCompare(b) : x - y;
};

/**
 * Los productos con las tallas en la escala pedida. Con «usa» no cambia nada. Con «peru», cada talla de calzado se cambia por
 * su equivalente y se ordenan de menor a mayor; el producto sin tabla (o la talla sin fila) se deja en USA y se informa en
 * `avisos`. Los productos sin tallas de calzado (ropa, accesorios) no se tocan ni se avisan.
 */
export function convertirProductos(
  productos: readonly ProductoCat[],
  idx: IndiceTallas,
  escala: EscalaTalla
): { productos: ProductoCat[]; avisos: AvisoTallas[] } {
  if (escala !== "peru") return { productos: [...productos], avisos: [] };
  const sinTabla = new Map<string, number>();
  const faltantes = new Map<string, { n: number; tallas: Set<string> }>();
  const convertidos = productos.map((p) => {
    const conCalzado = p.tallas.filter((t) => claveUsa(t) !== null);
    if (conCalzado.length === 0) return p;
    const marca = marcaCanonica(p.marca);
    const genero = generoCanonico(p.genero ?? "");
    const t = tablaDe(idx, marca, genero);
    const k = `${marca}|${genero}`;
    if (!t) {
      sinTabla.set(k, (sinTabla.get(k) ?? 0) + 1);
      return p;
    }
    const faltan: string[] = [];
    const nuevas = p.tallas.map((usa) => {
      const c = claveUsa(usa);
      if (c === null) return usa;
      const peru = t.tabla.get(c);
      if (peru === undefined) {
        faltan.push(usa);
        return usa;
      }
      return etiquetaPeru(peru);
    });
    if (faltan.length > 0) {
      const f = faltantes.get(k) ?? { n: 0, tallas: new Set<string>() };
      f.n++;
      faltan.forEach((x) => f.tallas.add(x));
      faltantes.set(k, f);
    }
    // Sin repetidos (dos tallas USA pueden compartir la peruana) y de menor a mayor.
    return { ...p, tallas: [...new Set(nuevas)].sort(ordenNumerico) };
  });
  const avisos: AvisoTallas[] = [
    ...[...sinTabla].map(([k, n]) => ({ marca: k.split("|")[0], genero: k.split("|")[1], productos: n, motivo: "sin_tabla" as const })),
    ...[...faltantes].map(([k, f]) => ({ marca: k.split("|")[0], genero: k.split("|")[1], productos: f.n, motivo: "tallas_faltantes" as const, tallas: [...f.tallas].sort(ordenNumerico) })),
  ].sort((a, b) => b.productos - a.productos || a.marca.localeCompare(b.marca));
  return { productos: convertidos, avisos };
}

/** El aviso en una frase para mostrarlo. */
export function textoAviso(a: AvisoTallas): string {
  return a.motivo === "sin_tabla"
    ? `${a.marca} · ${a.genero}: sin equivalencia (${a.productos.toLocaleString("en-US")} producto${a.productos === 1 ? "" : "s"} con talla USA)`
    : `${a.marca} · ${a.genero}: faltan las tallas USA ${a.tallas?.join(", ")} (${a.productos.toLocaleString("en-US")} producto${a.productos === 1 ? "" : "s"})`;
}

// ---------- validación de lo que llega (formulario o Excel) ----------
export type FilaEntrada = { fila: number; marca: unknown; genero: unknown; peru: unknown; usa: unknown; pie_cm: unknown };
export type ErrorFila = { fila: number; mensaje: string };

const numero = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/**
 * Valida filas «marca, género, perú, USA, pie» y las junta en tablas (una por marca y género). Las filas con problemas se
 * informan con su número y no entran; las filas totalmente vacías se ignoran. Devuelve `tablas` solo con lo válido.
 */
export function validarFilasTallas(filas: readonly FilaEntrada[]): { tablas: TablaTallas[]; errores: ErrorFila[] } {
  const errores: ErrorFila[] = [];
  const porTabla = new Map<string, TablaTallas>();
  for (const f of filas) {
    const vacia = [f.marca, f.genero, f.peru, f.usa, f.pie_cm].every((v) => v === null || v === undefined || String(v).trim() === "");
    if (vacia) continue;
    const marca = typeof f.marca === "string" ? marcaCanonica(f.marca) : "";
    if (marca === "" || marca.length > 40 || !/^[A-Z0-9 &.'-]+$/.test(marca)) {
      errores.push({ fila: f.fila, mensaje: "Falta la marca o tiene caracteres no válidos" });
      continue;
    }
    const generoTexto = typeof f.genero === "string" ? f.genero : "";
    if (!esGeneroConocido(generoTexto)) {
      errores.push({ fila: f.fila, mensaje: `Género no reconocido «${generoTexto}». Usa: ${GENEROS_TALLAS.join(", ")} (DAMA y PRE ESCOLAR también sirven)` });
      continue;
    }
    const genero = generoCanonico(generoTexto);
    const peru = numero(f.peru);
    if (peru === null || peru < 10 || peru > 60) {
      errores.push({ fila: f.fila, mensaje: `Talla peruana no válida «${String(f.peru ?? "")}» (un número entre 10 y 60)` });
      continue;
    }
    const usa = claveUsa(String(f.usa ?? ""));
    if (usa === null) {
      errores.push({ fila: f.fila, mensaje: `Talla USA no válida «${String(f.usa ?? "")}» (por ejemplo 8, 10.5, 1 o 3.5Y)` });
      continue;
    }
    const pieVacio = f.pie_cm === null || f.pie_cm === undefined || String(f.pie_cm).trim() === "";
    const pie = pieVacio ? null : numero(f.pie_cm);
    if (!pieVacio && (pie === null || pie < 5 || pie > 40)) {
      errores.push({ fila: f.fila, mensaje: `Largo del pie no válido «${String(f.pie_cm)}» (cm, entre 5 y 40; déjalo vacío si no lo tienes)` });
      continue;
    }
    const k = `${marca}|${genero}`;
    const t = porTabla.get(k) ?? { marca, genero, filas: [] };
    if (t.filas.some((x) => x.usa === usa)) {
      errores.push({ fila: f.fila, mensaje: `La talla USA ${usa} está repetida en ${marca} · ${genero}` });
      continue;
    }
    t.filas.push({ usa, peru: Math.round(peru * 10) / 10, pie_cm: pie === null ? null : Math.round(pie * 10) / 10 });
    porTabla.set(k, t);
  }
  const tablas = [...porTabla.values()].map((t) => ({ ...t, filas: [...t.filas].sort((a, b) => a.peru - b.peru || ordenNumerico(a.usa, b.usa)) }));
  tablas.sort((a, b) => a.marca.localeCompare(b.marca) || GENEROS_TALLAS.indexOf(a.genero as never) - GENEROS_TALLAS.indexOf(b.genero as never));
  return { tablas, errores };
}
