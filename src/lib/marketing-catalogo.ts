// Tipos y lógica PURA de los catálogos de Marketing (sin BD ni red): la usan el
// servidor (generar / publicar) y el visor público (tipos). Todas las
// coordenadas están en "px de diseño" (el ancho de la plantilla); la pantalla
// solo las escala.

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
};

/** Página de imagen completa (portada, divisor, redes…) subida desde el editor. */
export type PaginaFija = {
  id: string;
  tipo: "fija";
  /** Ruta en el bucket sin extensión: `<imagen>.webp`. */
  imagen: string;
  ancho: number;
  alto: number;
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
  generado: string;
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
  /** Precio lista en soles; null = sin límite. */
  precio_min: number | null;
  precio_max: number | null;
};

/**
 * Tipos de catálogo: llenan los filtros de un clic (después se pueden ajustar).
 * Los géneros UNISEX van con HOMBRE y con MUJER; el fútbol incluye accesorios
 * (pelotas, canilleras…), que en el ERP son UNISEX, por eso no filtra grupo.
 */
export const TIPOS_CATALOGO = [
  {
    id: "futbol",
    nombre: "Hombre y niño fútbol",
    descripcion: "Todo lo de fútbol: zapatillas, chimpunes, pelotas y accesorios, de hombre y de niño",
    categorias: ["FUTBOL"],
    grupos: [] as string[],
    generos: ["HOMBRE", "JUNIOR", "PRESCO", "INFANTE", "UNISEX"],
  },
  {
    id: "hombre",
    nombre: "Hombre",
    descripcion: "Zapatillas de hombre y unisex",
    categorias: [] as string[],
    grupos: ["ZAPATILLAS"],
    generos: ["HOMBRE", "UNISEX"],
  },
  {
    id: "mujer",
    nombre: "Mujer",
    descripcion: "Zapatillas de mujer y unisex",
    categorias: [] as string[],
    grupos: ["ZAPATILLAS"],
    generos: ["MUJER", "UNISEX"],
  },
  {
    id: "ninos",
    nombre: "Niños",
    descripcion: "Zapatillas de junior, preescolar e infante",
    categorias: [] as string[],
    grupos: ["ZAPATILLAS"],
    generos: ["JUNIOR", "PRESCO", "INFANTE"],
  },
] as const;

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
    precio_min: num(o.precio_min),
    precio_max: num(o.precio_max),
  };
}

/** Fecha de la base («2026-09-19 22:35:10», UTC) a hora de Lima («2026-09-19 17:35»); Perú no tiene horario de verano. */
export function fechaLima(utc: string): string {
  const d = new Date(`${utc.replace(" ", "T").slice(0, 19)}Z`);
  if (Number.isNaN(d.getTime())) return utc.slice(0, 16);
  return new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
}

/** Los filtros en frases cortas para mostrarlos. */
export function textoFiltros(f: FiltrosCatalogo): string[] {
  const tipo = TIPOS_CATALOGO.find((t) => t.id === f.tipo);
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
    precio,
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
  /** Códigos del ERP sin imagen en R2: no entran al catálogo. */
  sin_imagen: string[];
  /** Filas descartadas por no tener tallas con stock o precio. */
  sin_stock: number;
  /** Filas fuera del rango de precio pedido (solo cuando se filtró por precio). */
  fuera_de_precio?: number;
  paginas: number;
};

export type Borrador = {
  productos: ProductoCat[];
  paginas: PaginaCat[];
  /** Páginas que se sacaron en el editor; se pueden restaurar. */
  quitadas?: PaginaCat[];
  resumen: ResumenGeneracion;
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
 * @param plantillaDe id de la plantilla que corresponde a una marca
 * @param precio_rango los productos con precio lista fuera de este rango se descartan
 */
export function construirBorrador(
  items: ItemErp[],
  versiones: Map<string, number>,
  plantillaDe: (marca: string) => string,
  precio_rango: { min: number | null; max: number | null } = { min: null, max: null }
): Borrador {
  const vistos = new Set<string>();
  const generosPorCodigo = new Map<string, Set<string>>();
  const sinImagen = new Set<string>();
  const productos: ProductoCat[] = [];
  let duplicados = 0;
  let sinStock = 0;
  let fueraDePrecio = 0;

  for (const it of items) {
    const cod = it.cod_universal?.trim().toUpperCase();
    if (!cod) continue;
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
    const v = versiones.get(cod);
    if (v == null) {
      sinImagen.add(cod);
      continue;
    }
    productos.push({
      cod,
      v,
      marca: (it.marca ?? "").trim().toUpperCase(),
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
    plantilla: plantillaDe(p.marca),
    prod: i,
  }));

  return {
    productos,
    paginas,
    resumen: {
      erp_items: items.length,
      duplicados,
      multi_genero: [...generosPorCodigo.values()].filter((g) => g.size > 1).length,
      sin_imagen: [...sinImagen].sort(),
      sin_stock: sinStock,
      ...(precio_rango.min != null || precio_rango.max != null ? { fuera_de_precio: fueraDePrecio } : {}),
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
      salida.push({ id: o.id, tipo: "producto", plantilla: o.plantilla, prod, ...(ajuste ? { ajuste } : {}) });
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
