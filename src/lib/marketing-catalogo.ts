// Tipos y lógica PURA de los catálogos de Marketing (sin BD ni red): la usan el
// servidor (generar / publicar) y el visor público (tipos). Todas las
// coordenadas están en "px de diseño" (el ancho de la plantilla); la pantalla
// solo las escala.

import type { EscalaTalla } from "./marketing-tallas";

export type Zona = { x: number; y: number; w: number; h: number; color?: string; max?: number };
export type ZonasPlantilla = { codigo: Zona; tallas: Zona; precio: Zona; zapatilla: Zona };

export type Ajuste = { dx: number; dy: number; s: number };

/** Lo que el visor necesita de un producto. NUNCA cantidades ni precio de compra. */
export type ProductoCat = {
  cod: string;
  /** Versión de la imagen (mk_imagenes.version): entra en el nombre del WebP. */
  v: number;
  marca: string;
  modelo: string;
  /** HOMBRE, MUJER, JUNIOR…: un mismo código puede tener una página por género (tallas distintas). */
  genero?: string;
  tallas: string[];
  precio: number;
};

/** Una zapatilla sobre el diseño de su marca. `ajuste` es la posición corregida en el editor. */
export type PaginaProducto = {
  id: string;
  tipo: "producto";
  plantilla: string;
  /** Índice en `productos`. */
  prod: number;
  ajuste?: Ajuste;
  /** Solo en las páginas quitadas: «sync» = la quitó la sincronización con el ERP (el producto ya no tiene stock o no cumple los filtros). */
  motivo?: "sync";
};

/** Zona clicable de una página fija ya resuelta (va en el snapshot): rectángulo en fracciones 0–1 de la imagen. */
export type ZonaClicable = { x: number; y: number; w: number; h: number; url: string; etiqueta: string };

/** Página de imagen completa (portada, divisor, redes…) subida desde el editor. */
export type PaginaFija = {
  id: string;
  tipo: "fija";
  /** Ruta en el bucket sin extensión: `<imagen>.webp`. */
  imagen: string;
  ancho: number;
  alto: number;
  /** Enlaces sobre la imagen (WhatsApp, redes…); se agregan al publicar desde la biblioteca de páginas fijas. */
  zonas?: ZonaClicable[];
};

export type PaginaCat = PaginaProducto | PaginaFija;

export type PlantillaSnap = {
  ancho: number;
  alto: number;
  /** Ruta en el bucket sin extensión: `<fondo>.webp` (web) y `<fondo>.jpg` (PDF). */
  fondo: string;
  zonas: ZonasPlantilla;
};

/** JSON inmutable que lee el visor público. */
export type Snapshot = {
  titulo: string;
  /** Imagen JPEG de 1200×630 para la vista previa del enlace (ruta en el bucket); ausente en versiones antiguas. */
  og?: string;
  generado: string;
  /** Cuándo se consultó el stock al ERP (ISO); ausente en versiones publicadas antes de que se registrara. */
  stock_al?: string;
  /** Escala de las tallas que trae `productos` («peru» = ya convertidas); ausente = USA. */
  escala_talla?: EscalaTalla;
  imagenes_base: string;
  plantillas: Record<string, PlantillaSnap>;
  productos: ProductoCat[];
  paginas: PaginaCat[];
};

export type FiltrosCatalogo = {
  /** Tipo de catálogo elegido (id de TIPOS_CATALOGO); "" = filtros a mano. */
  tipo: string;
  almacenes: string[];
  /** Cada lista vacía = sin filtro (todos). Varios valores = cualquiera de ellos. */
  grupos: string[];
  marcas: string[];
  generos: string[];
  categorias: string[];
  /**
   * Tallas (escala USA del ERP: «9», «9.5», «M», «OSFA»…). Vacío = sin filtro. Entra el producto que tenga stock
   * en ALGUNA de ellas; la página sigue mostrando todas sus tallas con stock. El filtro se aplica aquí, sobre lo
   * que devuelve el ERP (su propio filtro `p_talla` rechaza todos los formatos probados).
   */
  tallas: string[];
  /** Precio lista en soles; null = sin límite. */
  precio_min: number | null;
  precio_max: number | null;
  /**
   * Escala de las tallas que se muestran: «peru» (la peruana, según la equivalencia de cada marca y género) o «usa» (la del ERP).
   * Los catálogos nuevos salen con «peru»; sin definir (catálogos anteriores) es «usa», para no cambiar lo que ya se publicó.
   */
  escala_talla?: EscalaTalla;
  /** Plantilla elegida por marca (marca → id); la clave «*» es la genérica. Sin elegir = la predeterminada. */
  plantillas: Record<string, string>;
  /** Portada elegida (id de página fija); null = sin portada; sin definir = la asociada al tipo de catálogo. */
  portada?: string | null;
  /** Separadores elegidos (ids de páginas fijas): entran al principio y se ubican a mano en el editor. */
  separadores?: string[];
  /**
   * Orden del documento fijado por Marketing en el Preview: ids de páginas fijas y el lugar de los productos:
   * CLAVE_PRODUCTOS (todas las páginas de producto juntas) o, si se separó por marcas, un `productos:MARCA` por cada
   * marca (los separadores de marca van antes de su bloque). Lo de antes de los productos abre el catálogo. Sin definir = orden automático
   * (portada, páginas iniciales, separadores elegidos, productos, cierres).
   */
  orden?: string[];
};

/** La escala de tallas de un catálogo; los anteriores a las equivalencias no la traen y siguen en USA. */
export const escalaDe = (f: { escala_talla?: EscalaTalla }): EscalaTalla => f.escala_talla ?? "usa";

/** Lugar de las páginas de producto dentro de `FiltrosCatalogo.orden`: todas juntas (por marca, una tras otra). */
export const CLAVE_PRODUCTOS = "productos";
/** Con el bloque separado por marcas: `productos:ADIDAS` es el lugar de las páginas de esa marca. */
const PREFIJO_MARCA = `${CLAVE_PRODUCTOS}:`;
export const claveDeMarca = (marca: string) => `${PREFIJO_MARCA}${marca.trim().toUpperCase()}`;
/** La marca de un `productos:MARCA`; null si no lo es. */
export const marcaDeClave = (clave: string): string | null => (clave.startsWith(PREFIJO_MARCA) && clave.length > PREFIJO_MARCA.length ? clave.slice(PREFIJO_MARCA.length) : null);
/** ¿Es el lugar de páginas de producto (todas o de una marca)? */
export const esClaveProductos = (clave: string) => clave === CLAVE_PRODUCTOS || marcaDeClave(clave) !== null;

/** Grupos del ERP que son ropa y grupos que son accesorios (los demás: calzado, sandalias, bebidas…). */
const GRUPOS_ROPA = ["POLOS", "POLERA", "SHORT", "CASACAS", "CAMISETAS", "BUZOS", "CONJUNTOS", "LEGGINS", "CANGUROS", "BIVIDIS"];
const GRUPOS_ACCESORIOS = [
  "PELOTAS", "GORRAS", "MOCHILAS", "CANILLERAS", "MEDIAS", "GUANTES", "MALETINES", "MITONES", "TOMATODO", "GORROS", "LENTES",
  "MORRAL", "RODILLERA", "MUSLERA", "BOLSOS", "CINTA ELASTICA", "SOGA PARA SALTAR", "BOLSAS", "CHIMPUNERA", "BILLETERAS", "MUÑEQUERAS",
];

/**
 * Tipos de catálogo: llenan los filtros de un clic (después se pueden ajustar) y cada uno tiene su PORTADA fija
 * asociada (ver `portadaDelTipo`). Los géneros UNISEX van con HOMBRE y con MUJER; el fútbol incluye accesorios
 * (pelotas, canilleras…), que en el ERP son UNISEX, por eso no filtra grupo. Género vacío = todos.
 */
export const TIPOS_CATALOGO = [
  { id: "hombre", nombre: "Hombres", descripcion: "Zapatillas de hombre y unisex", categorias: [], grupos: ["ZAPATILLAS"], generos: ["HOMBRE", "UNISEX"] },
  { id: "mujer", nombre: "Mujeres", descripcion: "Zapatillas de mujer y unisex", categorias: [], grupos: ["ZAPATILLAS"], generos: ["MUJER", "UNISEX"] },
  { id: "ninos", nombre: "Niños", descripcion: "Zapatillas de junior, preescolar e infante", categorias: [], grupos: ["ZAPATILLAS"], generos: ["JUNIOR", "PRESCO", "INFANTE"] },
  {
    id: "futbol",
    nombre: "Fútbol",
    descripcion: "Hombres y niños con categoría fútbol: zapatillas, chimpunes, pelotas y accesorios",
    categorias: ["FUTBOL"],
    grupos: [],
    generos: ["HOMBRE", "JUNIOR", "PRESCO", "INFANTE", "UNISEX"],
  },
  { id: "ropa-hombre", nombre: "Ropa hombre", descripcion: "Ropa de hombre y unisex", categorias: [], grupos: GRUPOS_ROPA, generos: ["HOMBRE", "UNISEX"] },
  { id: "ropa-mujer", nombre: "Ropa mujer", descripcion: "Ropa de mujer y unisex", categorias: [], grupos: GRUPOS_ROPA, generos: ["MUJER", "UNISEX"] },
  { id: "ropa", nombre: "Ropa general", descripcion: "Toda la ropa, de cualquier género", categorias: [], grupos: GRUPOS_ROPA, generos: [] },
  { id: "sandalias", nombre: "Sandalias", descripcion: "Sandalias de cualquier género", categorias: [], grupos: ["SANDALIAS"], generos: [] },
  { id: "accesorios", nombre: "Accesorios", descripcion: "Pelotas, gorras, mochilas, medias, canilleras y demás", categorias: [], grupos: GRUPOS_ACCESORIOS, generos: [] },
] as const satisfies readonly { id: string; nombre: string; descripcion: string; categorias: readonly string[]; grupos: readonly string[]; generos: readonly string[] }[];

/** Ids de los tipos de catálogo de fábrica. */
export const TIPOS_IDS: readonly string[] = TIPOS_CATALOGO.map((t) => t.id);

/** Filtros que un tipo de catálogo llena al elegirlo (lista vacía / null = no toca ese filtro). */
export type FiltrosDeTipo = {
  categorias: string[];
  grupos: string[];
  generos: string[];
  marcas: string[];
  tallas: string[];
  precio_min: number | null;
  precio_max: number | null;
};

/**
 * Tipo de catálogo tal como vive en la base de datos (tabla `mk_tipos`): los 9 de fábrica (`base`) y los que crea
 * Marketing. Todos hacen lo mismo: llenan los filtros, llevan su portada asociada y sus páginas automáticas.
 */
export type TipoCatalogo = FiltrosDeTipo & {
  id: string;
  nombre: string;
  descripcion: string;
  /** Tipo de fábrica: se puede editar y desactivar, no borrar. */
  base: boolean;
  activo: boolean;
};

const listaTipo = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim().toUpperCase()))] : [];
const precioTipo = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** Lee los filtros guardados de un tipo (JSON de `mk_tipos.filtros`); lo que falta o viene mal queda vacío. */
export function normalizarFiltrosTipo(crudo: unknown): FiltrosDeTipo {
  let o: Record<string, unknown> = {};
  try {
    const v = typeof crudo === "string" ? JSON.parse(crudo) : crudo;
    if (typeof v === "object" && v !== null) o = v as Record<string, unknown>;
  } catch {
    // JSON dañado: el tipo queda sin filtros y se ve en la pantalla de tipos.
  }
  return {
    categorias: listaTipo(o.categorias),
    grupos: listaTipo(o.grupos),
    generos: listaTipo(o.generos),
    marcas: listaTipo(o.marcas),
    tallas: listaTipo(o.tallas),
    precio_min: precioTipo(o.precio_min),
    precio_max: precioTipo(o.precio_max),
  };
}

/** Los tipos de fábrica del código: valores iniciales de la tabla, «restaurar» y respaldo si la tabla aún no existe. */
export const TIPOS_DE_FABRICA: readonly TipoCatalogo[] = TIPOS_CATALOGO.map((t) => ({
  id: t.id,
  nombre: t.nombre,
  descripcion: t.descripcion,
  base: true,
  activo: true,
  categorias: [...t.categorias],
  grupos: [...t.grupos],
  generos: [...t.generos],
  marcas: [],
  tallas: [],
  precio_min: null,
  precio_max: null,
}));

const lista = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim().toUpperCase()) : [];
const unico = (v: unknown): string[] => (typeof v === "string" && v.trim() ? [v.trim().toUpperCase()] : []);

/** Lee los filtros guardados de un catálogo, incluidos los de antes (un solo grupo, marca y género). */
export function normalizarFiltros(crudo: unknown): FiltrosCatalogo {
  const o = (typeof crudo === "object" && crudo !== null ? crudo : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    tipo: typeof o.tipo === "string" ? o.tipo : "",
    almacenes: lista(o.almacenes),
    grupos: o.grupos !== undefined ? lista(o.grupos) : unico(o.grupo),
    marcas: o.marcas !== undefined ? lista(o.marcas) : unico(o.marca),
    generos: o.generos !== undefined ? lista(o.generos) : unico(o.genero),
    categorias: lista(o.categorias),
    tallas: lista(o.tallas),
    precio_min: num(o.precio_min),
    precio_max: num(o.precio_max),
    ...(o.escala_talla === "peru" || o.escala_talla === "usa" ? { escala_talla: o.escala_talla } : {}),
    plantillas:
      typeof o.plantillas === "object" && o.plantillas !== null
        ? Object.fromEntries(Object.entries(o.plantillas as Record<string, unknown>).filter(([, v]) => typeof v === "string") as [string, string][])
        : {},
    ...(o.portada === null ? { portada: null } : typeof o.portada === "string" ? { portada: o.portada } : {}),
    ...(Array.isArray(o.separadores) ? { separadores: o.separadores.filter((x): x is string => typeof x === "string") } : {}),
    ...(Array.isArray(o.orden) ? { orden: o.orden.filter((x): x is string => typeof x === "string") } : {}),
  };
}

/** Marca de la plantilla genérica (sin marca), que se usa con las marcas que no tienen la suya. */
export const MARCA_GENERICA = "*";

/** Plantilla tal como la usan la pantalla de plantillas y la generación. */
export type PlantillaLista = {
  id: string;
  marca: string;
  nombre: string;
  activa: boolean;
  predeterminada: boolean;
  /** Ruta en el bucket sin extensión (`.webp` web, `.jpg` PDF). */
  fondo: string;
  ancho: number;
  alto: number;
  zonas: ZonasPlantilla;
};

/**
 * Plantilla que corresponde a una marca: la elegida al crear el catálogo, si no
 * la predeterminada de la marca y, si la marca no tiene ninguna, la genérica.
 * null = ni la marca ni la genérica tienen plantilla (el producto no entra).
 */
export function plantillaDeMarca(marca: string, todas: readonly PlantillaLista[], elegidas: Record<string, string> = {}): string | null {
  const activas = todas.filter((p) => p.activa);
  const de = (m: string): PlantillaLista | null => {
    const lista = activas.filter((p) => p.marca === m);
    return lista.find((p) => p.id === elegidas[m]) ?? lista.find((p) => p.predeterminada) ?? lista[0] ?? null;
  };
  return (de(marca) ?? de(MARCA_GENERICA))?.id ?? null;
}

/** Página fija de la biblioteca (mk_paginas_fijas), tal como la usan el editor y la generación. */
export type FijaBiblioteca = {
  id: string;
  nombre: string;
  tipo: "portada" | "separador" | "separador_marca" | "cierre" | "otra";
  /** Solo en los separadores de marca: la marca (mayúsculas, como en el ERP). */
  marca?: string | null;
  /** Ruta en el bucket sin extensión; la miniatura es `<imagen>-min.webp`. */
  imagen: string;
  ancho: number;
  alto: number;
  /** Tipos de catálogo a los que aplica, separados por coma, o «*» (todos). */
  auto_tipo: string | null;
  /** inicio/final = se pone sola al generar; null = solo se sugiere (se ubica a mano). */
  auto_posicion: "inicio" | "final" | null;
};

/**
 * Tipo de catálogo de unos filtros: el que se eligió. Con filtros personalizados es "" y el asistente pide
 * elegir la portada (o ninguna).
 */
export function tipoEfectivo(f: { tipo: string }): string {
  return f.tipo;
}

const tiposDe = (f: FijaBiblioteca) => (f.auto_tipo ?? "").split(",").map((t) => t.trim()).filter(Boolean);

/**
 * Portada asociada a un tipo de catálogo: entre las portadas activas que lo listan, la más específica (la que
 * lista menos tipos) y, a igualdad, la subida más recientemente (la biblioteca viene en orden de subida).
 */
export function portadaDelTipo<T extends FijaBiblioteca>(tipo: string, biblioteca: readonly T[]): T | null {
  if (tipo === "") return null;
  const candidatas = biblioteca.filter((f) => f.tipo === "portada" && tiposDe(f).includes(tipo));
  let mejor: T | null = null;
  for (const f of candidatas) if (mejor === null || tiposDe(f).length <= tiposDe(mejor).length) mejor = f;
  return mejor;
}

/**
 * Páginas fijas que corresponden a un tipo de catálogo, además de la portada: las que se ponen solas al inicio
 * y al final (términos, redes…) y las «sugeridas» (separadores…), que solo entran si se eligen.
 */
export function fijasAplicables<T extends FijaBiblioteca>(tipo: string, biblioteca: readonly T[]): { inicio: T[]; final: T[]; sugeridas: T[] } {
  const aplica = (f: FijaBiblioteca) => {
    const tipos = tiposDe(f);
    return tipos.includes("*") || (tipo !== "" && tipos.includes(tipo));
  };
  const lista = biblioteca.filter((f) => f.tipo !== "portada" && aplica(f));
  return {
    inicio: lista.filter((f) => f.auto_posicion === "inicio"),
    final: lista.filter((f) => f.auto_posicion === "final"),
    sugeridas: lista.filter((f) => f.auto_posicion === null),
  };
}

/**
 * Pone en el borrador las páginas fijas: la portada (la elegida o, si no se eligió, la del tipo), los separadores
 * elegidos, y los términos y redes al final. Se pueden quitar o mover en el editor.
 * @param opciones.portada id de la portada; null = sin portada; sin definir = la asociada al tipo
 * @param opciones.orden orden fijado en el Preview (ver `FiltrosCatalogo.orden`): sustituye a todo lo anterior
 */
export function conFijasAutomaticas(
  b: Borrador,
  tipo: string,
  biblioteca: FijaBiblioteca[],
  opciones: { portada?: string | null; separadores?: string[]; orden?: string[] } = {}
): Borrador {
  const pagina = (f: FijaBiblioteca): PaginaFija => ({ id: `f-${f.id}`, tipo: "fija", imagen: f.imagen, ancho: f.ancho, alto: f.alto });
  let delInicio: FijaBiblioteca[];
  let delFinal: FijaBiblioteca[];
  if (opciones.orden) {
    // Sin repetidos ni ids que ya no existan. Los lugares de productos parten las páginas de producto: `productos`
    // toma todas las que queden y `productos:MARCA` las de esa marca; las marcas que no tengan lugar se ponen tras el último.
    const ids = [...new Set(opciones.orden)];
    const enBiblioteca = (id: string) => biblioteca.find((f) => f.id === id);
    const marcaDe = (p: PaginaCat) => (p.tipo === "producto" ? (b.productos[p.prod]?.marca ?? "").trim().toUpperCase() : "");
    const conBloque = new Set(ids.map(marcaDeClave).filter((m): m is string => m !== null));
    const hayBloques = ids.some(esClaveProductos);
    const productos = b.paginas;
    const usadas = new Set<PaginaCat>();
    const tomar = (m: string | null): PaginaCat[] => {
      const l = productos.filter((p) => !usadas.has(p) && (m === null ? !conBloque.has(marcaDe(p)) : marcaDe(p) === m));
      l.forEach((p) => usadas.add(p));
      return l;
    };
    const ultimo = ids.map(esClaveProductos).lastIndexOf(true);
    const secuencia: PaginaCat[] = [];
    let fijas = 0;
    ids.forEach((id, i) => {
      const m = marcaDeClave(id);
      const bloque = id === CLAVE_PRODUCTOS ? tomar(null) : m !== null ? tomar(m) : null;
      if (bloque) {
        secuencia.push(...bloque);
        // Las marcas sin lugar propio (y el resto, si no hay ninguno) van tras el último lugar de productos.
        if (i === ultimo && id !== CLAVE_PRODUCTOS) secuencia.push(...tomar(null));
        return;
      }
      const f = enBiblioteca(id);
      if (!f) return;
      // Un separador de marca sin páginas de esa marca (no hubo productos) no se pone.
      if (f.tipo === "separador_marca" && !productos.some((p) => marcaDe(p) === (f.marca ?? "").trim().toUpperCase())) return;
      secuencia.push(pagina(f));
      fijas++;
    });
    // Sin lugar de productos: las fijas van primero y todos los productos después.
    const paginas = hayBloques ? secuencia : [...secuencia, ...tomar(null)];
    if (fijas === 0 && paginas.every((p, i) => p === b.paginas[i])) return b;
    return { ...b, paginas, resumen: { ...b.resumen, paginas: paginas.length, fijas } };
  } else {
    const portada = opciones.portada === undefined ? portadaDelTipo(tipo, biblioteca) : (biblioteca.find((f) => f.id === opciones.portada && f.tipo === "portada") ?? null);
    const { inicio, final } = fijasAplicables(tipo, biblioteca);
    const separadores = (opciones.separadores ?? []).map((id) => biblioteca.find((f) => f.id === id && f.tipo === "separador")).filter((f): f is FijaBiblioteca => Boolean(f));
    delInicio = [...(portada ? [portada] : []), ...inicio, ...separadores];
    delFinal = final;
  }
  if (delInicio.length + delFinal.length === 0) return b;
  const paginas = [...delInicio.map(pagina), ...b.paginas, ...delFinal.map(pagina)];
  return { ...b, paginas, resumen: { ...b.resumen, paginas: paginas.length, fijas: delInicio.length + delFinal.length } };
}

/** Fecha de la base («2026-09-19 22:35:10», UTC) a hora de Lima («2026-09-19 17:35»); Perú no tiene horario de verano. */
export function fechaLima(utc: string): string {
  const d = new Date(`${utc.replace(" ", "T").slice(0, 19)}Z`);
  if (Number.isNaN(d.getTime())) return utc.slice(0, 16);
  return new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
}

/** Los filtros en frases cortas para mostrarlos. */
export function textoFiltros(f: FiltrosCatalogo, tipos: readonly { id: string; nombre: string }[] = TIPOS_CATALOGO): string[] {
  const tipo = tipos.find((t) => t.id === f.tipo);
  const precio =
    f.precio_min != null && f.precio_max != null
      ? `Precio: S/ ${f.precio_min}–${f.precio_max}`
      : f.precio_min != null
        ? `Precio desde S/ ${f.precio_min}`
        : f.precio_max != null
          ? `Precio hasta S/ ${f.precio_max}`
          : "";
  return [
    tipo && `Tipo: ${tipo.nombre}`,
    f.categorias.length > 0 && `Categoría: ${f.categorias.join(", ")}`,
    f.marcas.length > 0 && `Marca: ${f.marcas.join(", ")}`,
    f.grupos.length > 0 && `Grupo: ${f.grupos.join(", ")}`,
    f.generos.length > 0 && `Género: ${f.generos.join(", ")}`,
    f.tallas.length > 0 && `Talla: ${f.tallas.join(", ")}`,
    precio,
    f.escala_talla === "peru" && "Tallas peruanas",
    `Almacenes: ${f.almacenes.join(", ")}`,
  ].filter((x): x is string => Boolean(x));
}

export type ResumenGeneracion = {
  /** Filas que devolvió el ERP. */
  erp_items: number;
  /** Filas repetidas en el ERP (mismo código Y mismo género): se conserva la primera. */
  duplicados: number;
  /** Códigos que aparecen en más de un género: cada género tiene su propia página. */
  multi_genero?: number;
  /**
   * Códigos que entraron al catálogo SIN imagen en R2: sus páginas salen vacías (versión de imagen 0) hasta que se les suba una
   * desde el editor.
   */
  sin_imagen: string[];
  /** Filas del ERP sin código: no se pueden mostrar. */
  sin_codigo?: number;
  /**
   * Filas del ERP que no están en el catálogo y NO tienen motivo (debe ser 0: cada fila entra o se descarta con un motivo
   * contado arriba). Si no es 0, algo se perdió sin explicación y se avisa.
   */
  sin_explicar?: number;
  /** true = la consulta al ERP se repartió por marca sin ver todas las de ERP (catálogo enorme): una marca desconocida podría faltar. */
  consulta_parcial?: boolean;
  /** Filas descartadas por no tener tallas con stock o precio. */
  sin_stock: number;
  /** Filas fuera del rango de precio pedido (solo cuando se filtró por precio). */
  fuera_de_precio?: number;
  /** Filas sin stock en ninguna de las tallas elegidas (solo cuando se filtró por talla). */
  fuera_de_talla?: number;
  /** Productos que no entran porque su marca no tiene plantilla: marca → cantidad. */
  sin_plantilla?: Record<string, number>;
  /** Productos que usaron la plantilla genérica por no tener la de su marca: marca → cantidad. */
  con_generica?: Record<string, number>;
  /** Páginas fijas (portada, términos…) que la generación puso sola; están contadas en `paginas`. */
  fijas?: number;
  paginas: number;
};

/** Lo que dejó la última sincronización con el ERP en un borrador (para avisarlo en el editor). */
export type ResumenSincronizacion = {
  /** ISO. */
  al: string;
  actualizados: number;
  nuevos: number;
  quitados: number;
  reactivados: number;
};

export type Borrador = {
  productos: ProductoCat[];
  paginas: PaginaCat[];
  /** Páginas que se sacaron en el editor o en la sincronización; se pueden restaurar. */
  quitadas?: PaginaCat[];
  resumen: ResumenGeneracion;
  /** Cuándo se consultó el stock al ERP (ISO): al generar y en cada sincronización. */
  stock_al?: string;
  /** Última sincronización con el ERP aplicada a este borrador. */
  sincronizacion?: ResumenSincronizacion;
};

/** Fila de producto tal como la entrega api/catalogo.py. */
export type ItemErp = {
  marca: string | null;
  cod_universal: string | null;
  modelo: string | null;
  genero: string | null;
  tallas: Record<string, number | string>;
  stock_total: number | string | null;
  precio_venta: number | string | null;
};

// Almacenes del ERP (los mismos que acepta el importador de stock). Por defecto
// se marcan JAL1 y T01–T10: los usados en las pruebas de catálogo; JAL4 y OUT
// quedan a elección.
export const ALMACENES = ["JAL1", "JAL4", "T01", "T02", "T03", "T04", "T05", "T06", "T07", "T08", "T09", "T10", "OUT"] as const;
export const ALMACENES_POR_DEFECTO = ["JAL1", "T01", "T02", "T03", "T04", "T05", "T06", "T07", "T08", "T09", "T10"];

const ORDEN_TALLAS_ROPA = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "2XL", "3XL", "4XL"];

/**
 * Orden de la lista de tallas para elegir: numéricas de menor a mayor («4», «4.5», «9»…), luego las de ropa en su
 * orden natural (XS, S, M, L, XL…) y al final las demás por orden alfabético (OSFA, S/T, 9-10Y…).
 */
export function ordenarOpcionesTalla(tallas: readonly string[]): string[] {
  const clave = (t: string): [number, number, string] => {
    const n = /^\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN;
    if (!Number.isNaN(n)) return [0, n, t];
    const i = ORDEN_TALLAS_ROPA.indexOf(t);
    return i >= 0 ? [1, i, t] : [2, 0, t];
  };
  return [...new Set(tallas.map((t) => t.trim().toUpperCase()).filter(Boolean))].sort((a, b) => {
    const [ga, na, ta] = clave(a);
    const [gb, nb, tb] = clave(b);
    return ga - gb || na - nb || ta.localeCompare(tb);
  });
}

/** Tallas con stock, ordenadas: numéricas de menor a mayor y luego las de texto. */
export function ordenarTallas(tallas: Record<string, number | string>): string[] {
  const conStock = Object.entries(tallas).filter(([, v]) => typeof v === "number" && v > 0).map(([t]) => t);
  const clave = (t: string): [number, number | string] => {
    const n = parseFloat(t);
    return Number.isNaN(n) ? [1, t] : [0, n];
  };
  return conStock.sort((a, b) => {
    const [ga, va] = clave(a);
    const [gb, vb] = clave(b);
    if (ga !== gb) return ga - gb;
    return va < vb ? -1 : va > vb ? 1 : 0;
  });
}

function numero(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Arma el borrador desde lo que devolvió el ERP: descarta lo que no se puede
 * mostrar (sin imagen, sin stock/precio), quita duplicados, ordena SIEMPRE por
 * marca (luego modelo, código y género) y crea una página por producto y género:
 * el mismo código en dos géneros da dos páginas (cada una con sus tallas).
 *
 * @param versiones   cod_universal (MAYÚSCULAS) → versión de su imagen en R2
 * @param plantillaDe id de la plantilla de una marca; null si la marca no tiene (el producto no entra)
 * @param precio_rango los productos con precio lista fuera de este rango se descartan
 * @param precio_rango.tallas si se indican, solo entran los productos con stock en alguna de ellas
 */
export function construirBorrador(
  items: ItemErp[],
  versiones: Map<string, number>,
  plantillaDe: (marca: string) => string | null,
  precio_rango: { min: number | null; max: number | null; tallas?: readonly string[] } = { min: null, max: null }
): Borrador {
  const tallasPedidas = new Set((precio_rango.tallas ?? []).map((t) => t.trim().toUpperCase()));
  const vistos = new Set<string>();
  const generosPorCodigo = new Map<string, Set<string>>();
  const sinImagen = new Set<string>();
  const productos: ProductoCat[] = [];
  let duplicados = 0;
  let sinStock = 0;
  let fueraDePrecio = 0;
  let fueraDeTalla = 0;
  let sinCodigo = 0;
  const sinPlantilla: Record<string, number> = {};

  for (const it of items) {
    const cod = it.cod_universal?.trim().toUpperCase();
    if (!cod) {
      sinCodigo++;
      continue;
    }
    const genero = (it.genero ?? "").trim().toUpperCase();
    const clave = `${cod}|${genero}`;
    if (vistos.has(clave)) {
      duplicados++;
      continue;
    }
    vistos.add(clave);
    (generosPorCodigo.get(cod) ?? generosPorCodigo.set(cod, new Set()).get(cod)!).add(genero);

    const tallas = ordenarTallas(it.tallas ?? {});
    const precio = numero(it.precio_venta);
    if (tallas.length === 0 || precio == null || precio <= 0) {
      sinStock++;
      continue;
    }
    if ((precio_rango.min != null && precio < precio_rango.min) || (precio_rango.max != null && precio > precio_rango.max)) {
      fueraDePrecio++;
      continue;
    }
    if (tallasPedidas.size > 0 && !tallas.some((t) => tallasPedidas.has(t.trim().toUpperCase()))) {
      fueraDeTalla++;
      continue;
    }
    const marca = (it.marca ?? "").trim().toUpperCase();
    // Sin diseño de su marca el producto no se muestra: con el de otra marca saldría el logo equivocado.
    if (plantillaDe(marca) === null) {
      sinPlantilla[marca || "(SIN MARCA)"] = (sinPlantilla[marca || "(SIN MARCA)"] ?? 0) + 1;
      continue;
    }
    // Sin imagen en R2 el producto entra igual, con la zapatilla vacía (versión 0): en el editor se ve dónde falta y se sube.
    const v = versiones.get(cod) ?? 0;
    if (v === 0) sinImagen.add(cod);
    productos.push({
      cod,
      v,
      marca,
      modelo: (it.modelo ?? "").trim().toUpperCase(),
      genero,
      tallas,
      precio,
    });
  }

  productos.sort(
    (a, b) =>
      a.marca.localeCompare(b.marca) ||
      a.modelo.localeCompare(b.modelo) ||
      a.cod.localeCompare(b.cod) ||
      (a.genero ?? "").localeCompare(b.genero ?? "")
  );

  const paginas: PaginaProducto[] = productos.map((p, i) => ({
    id: `p${i + 1}`,
    tipo: "producto",
    plantilla: plantillaDe(p.marca) as string,
    prod: i,
  }));

  const totalSinPlantilla = Object.values(sinPlantilla).reduce((a, b) => a + b, 0);
  return {
    productos,
    paginas,
    resumen: {
      erp_items: items.length,
      ...(sinCodigo > 0 ? { sin_codigo: sinCodigo } : {}),
      // Cada fila del ERP o entra (una página) o se descarta con un motivo contado; lo que sobre es una pérdida sin explicar.
      sin_explicar: items.length - productos.length - duplicados - sinCodigo - sinStock - fueraDePrecio - fueraDeTalla - totalSinPlantilla,
      duplicados,
      multi_genero: [...generosPorCodigo.values()].filter((g) => g.size > 1).length,
      sin_imagen: [...sinImagen].sort(),
      sin_stock: sinStock,
      ...(precio_rango.min != null || precio_rango.max != null ? { fuera_de_precio: fueraDePrecio } : {}),
      ...(tallasPedidas.size > 0 ? { fuera_de_talla: fueraDeTalla } : {}),
      ...(Object.keys(sinPlantilla).length > 0 ? { sin_plantilla: sinPlantilla } : {}),
      paginas: paginas.length,
    },
  };
}

/**
 * Snapshot público a partir del borrador. Solo lleva las plantillas y los
 * productos que las páginas usan de verdad (las páginas quitadas no viajan) y
 * los índices `prod` se reasignan a la lista compacta.
 */
export function armarSnapshot(
  titulo: string,
  borrador: Borrador,
  plantillas: Record<string, PlantillaSnap>,
  imagenesBase: string
): Snapshot {
  const productos: ProductoCat[] = [];
  const nuevoIndice = new Map<number, number>();
  const usadas = new Set<string>();
  const paginas: PaginaCat[] = borrador.paginas.map((p) => {
    if (p.tipo === "fija") return p;
    let n = nuevoIndice.get(p.prod);
    if (n === undefined) {
      n = productos.length;
      productos.push(borrador.productos[p.prod]);
      nuevoIndice.set(p.prod, n);
    }
    usadas.add(p.plantilla);
    return { ...p, prod: n };
  });
  return {
    titulo,
    generado: new Date().toISOString(),
    ...(borrador.stock_al ? { stock_al: borrador.stock_al } : {}),
    imagenes_base: imagenesBase,
    plantillas: Object.fromEntries(Object.entries(plantillas).filter(([id]) => usadas.has(id))),
    productos,
    paginas,
  };
}

/**
 * Valida las páginas que llegan del editor (datos del navegador: nunca se
 * confía en ellos). Devuelve las páginas normalizadas o un mensaje de error.
 */
export function validarPaginas(
  entrada: unknown,
  nProductos: number,
  plantillas: ReadonlySet<string>
): PaginaCat[] | string {
  if (!Array.isArray(entrada)) return "Formato de páginas inválido";
  if (entrada.length > 3000) return "Demasiadas páginas";
  const ids = new Set<string>();
  const salida: PaginaCat[] = [];
  for (const p of entrada) {
    if (typeof p !== "object" || p === null) return "Página inválida";
    const o = p as Record<string, unknown>;
    if (typeof o.id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(o.id) || ids.has(o.id)) {
      return "Identificador de página inválido o repetido";
    }
    ids.add(o.id);

    if (o.tipo === "producto") {
      const prod = o.prod;
      if (typeof prod !== "number" || !Number.isInteger(prod) || prod < 0 || prod >= nProductos) return "Producto inexistente";
      if (typeof o.plantilla !== "string" || !plantillas.has(o.plantilla)) return "Plantilla inexistente";
      let ajuste: Ajuste | undefined;
      if (o.ajuste !== undefined) {
        const a = (o.ajuste ?? {}) as Record<string, unknown>;
        const dx = Number(a.dx), dy = Number(a.dy), sc = Number(a.s);
        if (![dx, dy, sc].every(Number.isFinite) || Math.abs(dx) > 3000 || Math.abs(dy) > 3000 || sc < 0.2 || sc > 5) {
          return "Ajuste fuera de rango";
        }
        if (!(dx === 0 && dy === 0 && sc === 1)) ajuste = { dx: Math.round(dx), dy: Math.round(dy), s: Math.round(sc * 1000) / 1000 };
      }
      salida.push({ id: o.id, tipo: "producto", plantilla: o.plantilla, prod, ...(ajuste ? { ajuste } : {}), ...(o.motivo === "sync" ? { motivo: "sync" as const } : {}) });
    } else if (o.tipo === "fija") {
      if (typeof o.imagen !== "string" || !/^paginas-fijas\/[A-Za-z0-9-]{8,60}$/.test(o.imagen)) return "Imagen de página inválida";
      const ancho = Number(o.ancho), alto = Number(o.alto);
      if (!(ancho >= 100 && ancho <= 6000 && alto >= 100 && alto <= 6000)) return "Tamaño de página inválido";
      salida.push({ id: o.id, tipo: "fija", imagen: o.imagen, ancho: Math.round(ancho), alto: Math.round(alto) });
    } else {
      return "Tipo de página desconocido";
    }
  }
  return salida;
}

// ---------- zonas clicables de las páginas fijas ----------
export const TIPOS_ENLACE = [
  { id: "whatsapp", nombre: "WhatsApp" },
  { id: "instagram", nombre: "Instagram" },
  { id: "tiktok", nombre: "TikTok" },
  { id: "facebook", nombre: "Facebook" },
  { id: "web", nombre: "Otra página web" },
] as const;
export type TipoEnlace = (typeof TIPOS_ENLACE)[number]["id"];

/** Rectángulo de la biblioteca (fracciones 0–1 de la imagen) con el tipo de enlace que abre. `url` solo en «web». */
export type ZonaEnlace = { tipo: TipoEnlace; x: number; y: number; w: number; h: number; url?: string };

/** Enlaces de contacto guardados una vez (mk_enlaces): número de WhatsApp, usuarios de las redes… */
export type Enlaces = Partial<Record<Exclude<TipoEnlace, "web">, { valor: string; mensaje?: string | null }>>;

/** ¿Es una dirección web https válida? (los enlaces de los clientes nunca usan http ni otros esquemas). */
export function esUrlHttps(u: unknown): boolean {
  if (typeof u !== "string" || u.length > 300) return false;
  try {
    return new URL(u).protocol === "https:";
  } catch {
    return false;
  }
}

/** Dirección final de un enlace de contacto; null si falta el dato o no es válido. */
export function enlaceDeContacto(tipo: Exclude<TipoEnlace, "web">, e: { valor: string; mensaje?: string | null } | undefined): string | null {
  const valor = (e?.valor ?? "").trim();
  if (!valor) return null;
  if (tipo === "whatsapp") {
    const n = valor.replace(/\D/g, "");
    // Un número peruano de 9 dígitos lleva el 51 delante.
    const completo = n.length === 9 ? `51${n}` : n;
    if (completo.length < 8 || completo.length > 15) return null;
    const texto = (e?.mensaje ?? "").trim();
    return `https://wa.me/${completo}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
  }
  if (esUrlHttps(valor)) return valor;
  if (tipo === "facebook") return /^[A-Za-z0-9.\-]{1,60}$/.test(valor) ? `https://www.facebook.com/${valor}` : null;
  const usuario = valor.replace(/^@/, "");
  if (!/^[A-Za-z0-9._]{1,40}$/.test(usuario)) return null;
  return tipo === "instagram" ? `https://www.instagram.com/${usuario}/` : `https://www.tiktok.com/@${usuario}`;
}

/** Zona ya resuelta para el snapshot; null si su enlace no está configurado. */
export function resolverZona(z: ZonaEnlace, enlaces: Enlaces): ZonaClicable | null {
  const url = z.tipo === "web" ? (esUrlHttps(z.url) ? (z.url as string) : null) : enlaceDeContacto(z.tipo, enlaces[z.tipo]);
  if (!url) return null;
  const etiqueta = TIPOS_ENLACE.find((t) => t.id === z.tipo)?.nombre ?? "Enlace";
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return { x: r(z.x), y: r(z.y), w: r(z.w), h: r(z.h), url, etiqueta };
}

/**
 * Agrega a las páginas fijas del snapshot sus zonas clicables, según la biblioteca (por la ruta de la imagen).
 * Las páginas subidas solo para un catálogo no están en la biblioteca y no llevan zonas.
 */
export function conZonasClicables(paginas: PaginaCat[], biblioteca: readonly { imagen: string; zonas: readonly ZonaEnlace[] }[], enlaces: Enlaces): PaginaCat[] {
  const porImagen = new Map(biblioteca.map((f) => [f.imagen, f.zonas]));
  return paginas.map((p) => {
    if (p.tipo !== "fija") return p;
    const zonas = (porImagen.get(p.imagen) ?? []).map((z) => resolverZona(z, enlaces)).filter((z): z is ZonaClicable => z !== null);
    return zonas.length > 0 ? { ...p, zonas } : p;
  });
}

/** Valida las zonas que llegan del navegador; devuelve las zonas limpias o un mensaje de error. */
export function validarZonasEnlace(entrada: unknown): ZonaEnlace[] | string {
  if (!Array.isArray(entrada)) return "Formato de zonas inválido";
  if (entrada.length > 20) return "Demasiadas zonas (máximo 20)";
  const salida: ZonaEnlace[] = [];
  for (const z of entrada) {
    const o = (typeof z === "object" && z !== null ? z : {}) as Record<string, unknown>;
    const tipo = TIPOS_ENLACE.find((t) => t.id === o.tipo)?.id;
    if (!tipo) return "Tipo de enlace no válido";
    const [x, y, w, h] = [o.x, o.y, o.w, o.h].map(Number);
    if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w < 0.01 || h < 0.01 || x + w > 1.0001 || y + h > 1.0001) return "Una zona queda fuera de la imagen";
    if (tipo === "web" && !esUrlHttps(o.url)) return "La dirección web debe empezar con https://";
    const r = (n: number) => Math.round(n * 10000) / 10000;
    salida.push({ tipo, x: r(x), y: r(y), w: r(w), h: r(h), ...(tipo === "web" ? { url: o.url as string } : {}) });
  }
  return salida;
}

// ---------- consultas al ERP en trozos ----------
/** Una consulta al ERP: marcas y géneros a pedir (grupo, categoría y almacenes van iguales en todas). */
export type ConsultaErp = { marcas: string[]; generos: string[] };

/**
 * Lo que tarda el ERP en responder UNA consulta de `n` filas, en segundos. Medido: 68 filas → 1 s, 253 → 4 s, 344 → 5 s,
 * 938 → 27 s: crece más que proporcional (~n^1.6), por eso varias consultas chicas en paralelo son más rápidas que una grande.
 */
export const segundosConsultaErp = (n: number): number => 27 * (Math.max(n, 0) / 938) ** 1.6 + 1;

/**
 * Segundos que se aceptan para una consulta única sin filtro de marca. Las funciones de Vercel duran hasta 300 s
 * (Hobby con Fluid Compute); se usa la mitad para tener margen con un ERP más lento de lo medido y para el resto del trabajo.
 */
export const PRESUPUESTO_CONSULTA_ERP_S = 150;

/** Cuánto más puede traer el ERP que lo que cuenta el sistema (que puede no conocer aún productos nuevos). */
const MARGEN_CONTEO = 1.3;

/** El valor que espera el filtro de marca del ERP: el nombre SIN espacios («NEW BALANCE» se pide como «NEWBALANCE»). */
export const valorMarcaErp = (marca: string): string => marca.replace(/\s+/g, "");

export type PlanErp = {
  consultas: ConsultaErp[];
  /**
   * true = la consulta se repartió por marca sin tener a la vista todas las marcas del ERP (el catálogo es tan grande que una
   * sola consulta no cabe en el tiempo): una marca que el sistema no conoce podría faltar, y así se avisa en el catálogo.
   */
  parcial: boolean;
};

/**
 * Qué pedir al ERP. Lo único que garantiza no perder nada es que el ERP entregue TODO lo que cumple los filtros, así que:
 *  · marcas elegidas expresamente → esas marcas, una consulta por marca, en paralelo (completo para esas marcas);
 *  · sin marca elegida → UNA consulta sin filtro de marca (completa por construcción) mientras su tiempo estimado quepa
 *    en `PRESUPUESTO_CONSULTA_ERP_S`;
 *  · si no cabe → se reparte por marca (`particionarPorMarca`) y el plan queda `parcial`.
 * No hay un tope de filas: lo que decide es el tiempo.
 * @param conteos productos con stock por marca y género según el sistema (aproximado; solo sirve para estimar y repartir)
 */
export function planificarConsultas(
  conteos: readonly { marca: string; genero: string; n: number }[],
  o: { generosFiltro?: readonly string[]; universoMarcas?: readonly string[]; universoGeneros?: readonly string[]; marcasPedidas?: readonly string[]; presupuestoS?: number } = {}
): PlanErp {
  const generos = [...(o.generosFiltro ?? [])];
  const pedidas = [...new Set(o.marcasPedidas ?? [])];
  if (pedidas.length > 0) return { consultas: pedidas.map((m) => ({ marcas: [m], generos })), parcial: false };

  const estimadas = conteos.reduce((a, c) => a + c.n, 0) * MARGEN_CONTEO;
  if (segundosConsultaErp(estimadas) <= (o.presupuestoS ?? PRESUPUESTO_CONSULTA_ERP_S)) return { consultas: [{ marcas: [], generos }], parcial: false };

  // Demasiado grande para una consulta: bloques de ~500 filas (≈ 10 s cada uno), en paralelo.
  const consultas = particionarPorMarca(conteos, { tope: 500, generosFiltro: generos, universoMarcas: o.universoMarcas, universoGeneros: o.universoGeneros });
  return { consultas: consultas.length > 0 ? consultas : [{ marcas: [], generos }], parcial: true };
}

/**
 * Reparte lo que hay que pedir al ERP en consultas de tamaño moderado que se pueden hacer en paralelo. Las marcas chicas se
 * juntan; una marca grande se parte por género. Las marcas nunca se repiten entre consultas, así que no hay filas dobles.
 * Los conteos del sistema solo deciden CÓMO repartir: todas las marcas conocidas se piden con TODOS los géneros del filtro.
 * OJO: el ERP no entrega lo que no se le pide por nombre, así que una marca desconocida para el sistema no entra aquí.
 * @param conteos productos con stock por marca y género según el sistema (aproximado)
 * @param o.generosFiltro géneros del filtro (vacío = todos)
 * @param o.universoMarcas todas las marcas que conoce el sistema; o.universoGeneros todos los géneros que conoce
 */
export function particionarPorMarca(
  conteos: readonly { marca: string; genero: string; n: number }[],
  o: { tope: number; generosFiltro?: readonly string[]; universoMarcas?: readonly string[]; universoGeneros?: readonly string[] }
): ConsultaErp[] {
  const tope = o.tope;
  const generosFiltro = [...(o.generosFiltro ?? [])];
  const porMarca = new Map<string, { genero: string; n: number }[]>();
  const agregar = (m: string) => porMarca.get(m) ?? porMarca.set(m, []).get(m)!;
  for (const c of conteos) if (c.marca.trim() !== "" && c.n > 0) agregar(c.marca).push({ genero: c.genero, n: c.n });
  // Todas las marcas que conoce el sistema (también las sin filas locales para estos filtros).
  for (const m of o.universoMarcas ?? []) if (m.trim() !== "") agregar(m);
  const total = (gs: { n: number }[]) => gs.reduce((a, g) => a + g.n, 0);
  // Todos los géneros posibles: los del filtro o, sin filtro, los que conoce el sistema.
  const generosPosibles = generosFiltro.length > 0 ? generosFiltro : [...(o.universoGeneros ?? [])];

  const consultas: ConsultaErp[] = [];
  let chicas = { marcas: [] as string[], n: 0 };
  const cerrarChicas = () => {
    if (chicas.marcas.length > 0) consultas.push({ marcas: chicas.marcas, generos: generosFiltro });
    chicas = { marcas: [], n: 0 };
  };

  for (const [marca, gs] of [...porMarca].sort((a, b) => total(b[1]) - total(a[1]) || a[0].localeCompare(b[0]))) {
    const n = total(gs);
    if (n > tope && generosPosibles.length > 1) {
      // Marca grande: se parte por género en trozos de hasta `tope` filas; los géneros sin conteo van con el trozo más chico.
      const grupos: { generos: string[]; n: number }[] = [];
      for (const g of [...gs].sort((a, b) => b.n - a.n)) {
        const ultimo = grupos[grupos.length - 1];
        if (ultimo && ultimo.n + g.n <= tope) {
          ultimo.generos.push(g.genero);
          ultimo.n += g.n;
        } else grupos.push({ generos: [g.genero], n: g.n });
      }
      const conocidos = new Set(gs.map((g) => g.genero));
      const sinConteo = generosPosibles.filter((g) => !conocidos.has(g));
      if (sinConteo.length > 0) {
        const menor = grupos.reduce((m, g) => (g.n < m.n ? g : m), grupos[0]);
        menor.generos.push(...sinConteo);
      }
      for (const g of grupos) consultas.push({ marcas: [marca], generos: g.generos });
    } else {
      if (chicas.n + n > tope) cerrarChicas();
      chicas.marcas.push(marca);
      chicas.n += n;
    }
  }
  cerrarChicas();
  return consultas;
}
