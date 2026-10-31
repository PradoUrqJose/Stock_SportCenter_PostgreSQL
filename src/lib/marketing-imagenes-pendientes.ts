import type { ItemErp } from "./marketing-catalogo";

export type ProductoRevisionImagen = {
  codigo: string;
  marcas: string[];
  modelos: string[];
  generos: string[];
  categorias: string[];
  colores: string[];
  /** null: el ERP repite la ficha de una edad; no se inventa una suma. */
  stock: number | null;
  fichasRepetidas: boolean;
};

const normal = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();
export const codigoRevisionImagen = (s: string) =>
  normal(s) === "400497_07" ? "400497-07" : normal(s);
const agregar = (lista: string[], valor: string | null | undefined) => {
  const s = normal(valor);
  if (s && !lista.includes(s)) lista.push(s);
};

/** Una imagen por código, sin depender de plantillas, precio, catálogos ni productos importados. */
export function productosRevisionImagen(
  items: readonly ItemErp[],
): ProductoRevisionImagen[] {
  const productos = new Map<string, ProductoRevisionImagen>();
  const fichas = new Set<string>();
  for (const item of items) {
    const codigo = codigoRevisionImagen(item.cod_universal ?? "");
    const stock = Number(item.stock_total);
    if (!codigo || !Number.isFinite(stock) || stock <= 0) continue;
    let p = productos.get(codigo);
    if (!p) {
      p = {
        codigo,
        marcas: [],
        modelos: [],
        generos: [],
        categorias: [],
        colores: [],
        stock: 0,
        fichasRepetidas: false,
      };
      productos.set(codigo, p);
    }
    const clave = `${codigo}|${normal(item.genero)}`;
    if (fichas.has(clave)) {
      p.fichasRepetidas = true;
      p.stock = null;
    } else if (p.stock !== null) p.stock += stock;
    fichas.add(clave);
    agregar(p.marcas, item.marca);
    agregar(p.modelos, item.modelo);
    agregar(p.generos, item.genero);
    agregar(p.categorias, item.categoria);
    agregar(p.colores, item.color);
  }
  return [...productos.values()]
    .map((p) => {
      for (const lista of [
        p.marcas,
        p.modelos,
        p.generos,
        p.categorias,
        p.colores,
      ])
        lista.sort();
      return p;
    })
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export function sinImagenRegistrada(
  productos: readonly ProductoRevisionImagen[],
  codigosConImagen: readonly string[],
) {
  const imagenes = new Set(codigosConImagen.map(codigoRevisionImagen));
  return productos.filter((p) => !imagenes.has(p.codigo));
}

export type FiltrosRevisionImagen = {
  q: string;
  marca: string;
  genero: string;
  categoria: string;
  orden: "stock" | "codigo" | "marca";
};
export function filtrarRevisionImagen(
  productos: readonly ProductoRevisionImagen[],
  f: FiltrosRevisionImagen,
) {
  const q = normal(f.q);
  return productos
    .filter(
      (p) =>
        (!f.marca || p.marcas.includes(f.marca)) &&
        (!f.genero || p.generos.includes(f.genero)) &&
        (!f.categoria || p.categorias.includes(f.categoria)) &&
        (!q ||
          [p.codigo, ...p.marcas, ...p.modelos, ...p.colores].some((s) =>
            s.includes(q),
          )),
    )
    .sort(
      (a, b) =>
        (f.orden === "stock"
          ? (b.stock ?? -1) - (a.stock ?? -1)
          : f.orden === "marca"
            ? a.marcas.join().localeCompare(b.marcas.join())
            : 0) || a.codigo.localeCompare(b.codigo),
    );
}

/** Todas las filas filtradas, no solo la página visible. Evita fórmulas al abrir el CSV. */
export function csvRevisionImagen(
  productos: readonly ProductoRevisionImagen[],
): string {
  const celda = (v: string) =>
    `"${(/^[=+@\-\t\r]/.test(v) ? "'" + v : v).replaceAll('"', '""')}"`;
  const filas = [
    ["Código", "Marca", "Modelo", "Género", "Categoría", "Color", "Stock"],
    ...productos.map((p) => [
      p.codigo,
      p.marcas.join(" / "),
      p.modelos.join(" / "),
      p.generos.join(" / "),
      p.categorias.join(" / "),
      p.colores.join(" / "),
      p.stock === null ? "Por revisar en ERP" : String(p.stock),
    ]),
  ];
  return "\uFEFF" + filas.map((fila) => fila.map(celda).join(";")).join("\r\n");
}
