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
  tallas: string[];
  precio: number;
};

export type PaginaCat = {
  id: string;
  tipo: "producto";
  plantilla: string;
  prod: number;
  ajuste?: Ajuste;
};

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
  almacenes: string[];
  grupo: string;
  marca: string;
  genero: string;
};

export type ResumenGeneracion = {
  /** Filas que devolvió el ERP. */
  erp_items: number;
  /** Códigos repetidos en el ERP (mismo código en varios géneros): se conserva el primero. */
  duplicados: number;
  /** Códigos del ERP sin imagen en R2: no entran al catálogo. */
  sin_imagen: string[];
  /** Filas descartadas por no tener tallas con stock o precio. */
  sin_stock: number;
  paginas: number;
};

export type Borrador = {
  productos: ProductoCat[];
  paginas: PaginaCat[];
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
 * marca (luego modelo y código) y crea una página por producto.
 *
 * @param versiones   cod_universal (MAYÚSCULAS) → versión de su imagen en R2
 * @param plantillaDe id de la plantilla que corresponde a una marca
 */
export function construirBorrador(
  items: ItemErp[],
  versiones: Map<string, number>,
  plantillaDe: (marca: string) => string
): Borrador {
  const vistos = new Set<string>();
  const sinImagen = new Set<string>();
  const productos: ProductoCat[] = [];
  let duplicados = 0;
  let sinStock = 0;

  for (const it of items) {
    const cod = it.cod_universal?.trim().toUpperCase();
    if (!cod) continue;
    if (vistos.has(cod)) {
      duplicados++;
      continue;
    }
    vistos.add(cod);

    const tallas = ordenarTallas(it.tallas ?? {});
    const precio = numero(it.precio_venta);
    if (tallas.length === 0 || precio == null || precio <= 0) {
      sinStock++;
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
      tallas,
      precio,
    });
  }

  productos.sort(
    (a, b) => a.marca.localeCompare(b.marca) || a.modelo.localeCompare(b.modelo) || a.cod.localeCompare(b.cod)
  );

  const paginas: PaginaCat[] = productos.map((p, i) => ({
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
      sin_imagen: [...sinImagen].sort(),
      sin_stock: sinStock,
      paginas: paginas.length,
    },
  };
}

/** Snapshot público a partir del borrador: solo las plantillas realmente usadas. */
export function armarSnapshot(
  titulo: string,
  borrador: Borrador,
  plantillas: Record<string, PlantillaSnap>,
  imagenesBase: string
): Snapshot {
  const usadas = new Set(borrador.paginas.map((p) => p.plantilla));
  return {
    titulo,
    generado: new Date().toISOString(),
    imagenes_base: imagenesBase,
    plantillas: Object.fromEntries(Object.entries(plantillas).filter(([id]) => usadas.has(id))),
    productos: borrador.productos,
    paginas: borrador.paginas,
  };
}
