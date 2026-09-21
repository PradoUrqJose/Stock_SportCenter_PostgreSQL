// Sincronizar un catálogo con el ERP (lógica PURA, sin BD ni red): toma el catálogo tal como está (el borrador de una
// versión) y los datos frescos que dio el ERP, y devuelve el borrador con el stock y los precios al día. Se conserva
// todo lo que Marketing ya trabajó (posición de las zapatillas, plantillas, orden, páginas fijas, quitadas a mano).
//   · Producto que sigue en el ERP → se actualizan sus tallas y su precio.
//   · Producto nuevo (entra por stock o por los filtros) → se agrega en el lugar que le toca dentro de su marca.
//   · Producto que ya no tiene stock o ya no cumple los filtros → se quita, queda en «Quitadas» (restaurable) y SIEMPRE
//     se informa. Si vuelve a tener stock, su página regresa con la posición que tenía.
// Un producto se identifica por código + género (un mismo código puede tener una página por género).
import type { Borrador, PaginaCat, PaginaProducto, ProductoCat, ResumenGeneracion } from "./marketing-catalogo";

export type ProductoResumen = { cod: string; marca: string; modelo: string; genero: string };

export type InformeSincronizacion = {
  /** Cuándo se consultó el ERP (ISO). */
  al: string;
  /** Páginas de producto antes y después. */
  antes: number;
  despues: number;
  /** Productos que siguen y cambiaron de tallas o de precio (cada uno cuenta una vez). */
  actualizados: number;
  cambiosTallas: number;
  cambiosPrecio: number;
  sinCambios: number;
  nuevos: ProductoResumen[];
  quitados: ProductoResumen[];
  /** Vuelven porque otra vez tienen stock (los había quitado una sincronización anterior). */
  reactivados: ProductoResumen[];
  /** Del ERP: productos que no entran por no tener plantilla de su marca (marca → cantidad). */
  sinPlantilla: Record<string, number>;
  /** Del ERP: códigos con stock que no tienen imagen. */
  sinImagen: string[];
};

export const claveProducto = (p: { cod: string; genero?: string }) => `${p.cod}|${(p.genero ?? "").toUpperCase()}`;
const resumen = (p: ProductoCat): ProductoResumen => ({ cod: p.cod, marca: p.marca, modelo: p.modelo, genero: p.genero ?? "" });

/** Como se ordenan las páginas al generar: marca, modelo, código y género. */
const comparar = (a: ProductoCat, b: ProductoCat) =>
  a.marca.localeCompare(b.marca) || a.modelo.localeCompare(b.modelo) || a.cod.localeCompare(b.cod) || (a.genero ?? "").localeCompare(b.genero ?? "");

export function sincronizarBorrador(actual: Borrador, fresco: Borrador, al: string): { borrador: Borrador; informe: InformeSincronizacion } {
  const frescos = new Map(fresco.productos.map((p) => [claveProducto(p), p]));
  // Plantilla que el ERP le asignaría a cada producto nuevo (la de su marca).
  const plantillaFresca = new Map<string, string>();
  for (const pg of fresco.paginas) if (pg.tipo === "producto") plantillaFresca.set(claveProducto(fresco.productos[pg.prod]), pg.plantilla);

  const productos = actual.productos.map((p) => ({ ...p }));
  const quitadasPrevias = actual.quitadas ?? [];
  const paginasProducto = (l: readonly PaginaCat[]) => l.filter((p): p is PaginaProducto => p.tipo === "producto");

  // 1. Emparejar cada producto del catálogo (activo o quitado) con el del ERP: primero por código + género y, para los
  //    catálogos generados antes de «una página por género» (sus productos no traen género), por código.
  const referenciados = [...new Set(paginasProducto([...actual.paginas, ...quitadasPrevias]).map((pg) => pg.prod))];
  const porCodigo = new Map<string, ProductoCat[]>();
  for (const f of fresco.productos) (porCodigo.get(f.cod) ?? porCodigo.set(f.cod, []).get(f.cod)!).push(f);
  const reclamados = new Set<string>();
  const pareja = new Map<number, ProductoCat>();
  for (const i of referenciados) {
    const p = productos[i];
    if ((p.genero ?? "") === "") continue;
    const k = claveProducto(p);
    const f = frescos.get(k);
    if (f && !reclamados.has(k)) {
      pareja.set(i, f);
      reclamados.add(k);
    }
  }
  for (const i of referenciados) {
    const p = productos[i];
    if ((p.genero ?? "") !== "" || pareja.has(i)) continue;
    const f = (porCodigo.get(p.cod) ?? []).find((x) => !reclamados.has(claveProducto(x)));
    if (f) {
      pareja.set(i, f);
      reclamados.add(claveProducto(f));
    }
  }

  // Datos al día de los que siguen en el ERP.
  const activosProd = new Set(paginasProducto(actual.paginas).map((pg) => pg.prod));
  let cambiosTallas = 0;
  let cambiosPrecio = 0;
  let actualizados = 0;
  let sinCambios = 0;
  for (const [i, f] of pareja) {
    const p = productos[i];
    const tallas = p.tallas.join("|") !== f.tallas.join("|");
    const precio = p.precio !== f.precio;
    if (tallas) cambiosTallas++;
    if (precio) cambiosPrecio++;
    if (tallas || precio) actualizados++;
    else if (activosProd.has(i)) sinCambios++;
    // Si el catálogo es de antes de los géneros, el producto lo toma del ERP (no cuenta como cambio).
    productos[i] = { ...p, tallas: f.tallas, precio: f.precio, marca: f.marca, modelo: f.modelo, genero: f.genero };
  }

  // 2. Los que ya no están en el ERP salen de las páginas (quedan en «Quitadas» con su motivo).
  const paginas: PaginaCat[] = [];
  const quitadas: PaginaCat[] = [];
  const quitados: ProductoResumen[] = [];
  for (const pg of actual.paginas) {
    if (pg.tipo !== "producto") {
      paginas.push(pg);
      continue;
    }
    if (pareja.has(pg.prod)) paginas.push(pg);
    else {
      quitadas.push({ ...pg, motivo: "sync" });
      quitados.push(resumen(productos[pg.prod]));
    }
  }
  // Las quitadas antes: las de la sincronización que vuelven a tener stock regresan; las quitadas a mano se respetan.
  const reactivar: PaginaProducto[] = [];
  for (const q of quitadasPrevias) {
    if (q.tipo === "producto" && q.motivo === "sync" && pareja.has(q.prod)) {
      const vuelve: PaginaProducto = { ...q };
      delete vuelve.motivo;
      reactivar.push(vuelve);
    } else quitadas.push(q);
  }

  // 3. Productos nuevos: los que el ERP trae y el catálogo no tiene (ni entre las quitadas).
  const plantillaPorMarca = new Map<string, string>();
  for (const pg of paginasProducto([...actual.paginas, ...quitadasPrevias])) {
    const m = productos[pg.prod].marca;
    if (!plantillaPorMarca.has(m)) plantillaPorMarca.set(m, pg.plantilla);
  }
  const ids = new Set([...actual.paginas, ...quitadasPrevias].map((p) => p.id));
  let contador = 0;
  const nuevoId = () => {
    let id: string;
    do id = `s${(++contador).toString(36)}`;
    while (ids.has(id));
    ids.add(id);
    return id;
  };
  const nuevos: ProductoResumen[] = [];
  const paginasNuevas: PaginaProducto[] = [];
  for (const f of [...fresco.productos].sort(comparar)) {
    const k = claveProducto(f);
    if (reclamados.has(k)) continue;
    const plantilla = plantillaPorMarca.get(f.marca) ?? plantillaFresca.get(k);
    if (!plantilla) continue;
    productos.push({ ...f });
    paginasNuevas.push({ id: nuevoId(), tipo: "producto", plantilla, prod: productos.length - 1 });
    nuevos.push(resumen(f));
  }

  // Cada página que entra (nueva o reactivada) va donde le toca por marca, modelo, código y género.
  const insertar = (pg: PaginaProducto) => {
    const p = productos[pg.prod];
    let destino = -1;
    let ultimaMarca = -1;
    let primeraMayor = -1;
    let ultimaProducto = -1;
    for (let i = 0; i < paginas.length; i++) {
      const q = paginas[i];
      if (q.tipo !== "producto") continue;
      const pq = productos[q.prod];
      ultimaProducto = i;
      if (pq.marca === p.marca) {
        if (comparar(pq, p) > 0) {
          destino = i;
          break;
        }
        ultimaMarca = i;
      } else if (primeraMayor === -1 && pq.marca.localeCompare(p.marca) > 0) primeraMayor = i;
    }
    if (destino === -1) destino = ultimaMarca !== -1 ? ultimaMarca + 1 : primeraMayor !== -1 ? primeraMayor : ultimaProducto !== -1 ? ultimaProducto + 1 : paginas.length;
    paginas.splice(destino, 0, pg);
  };
  const reactivados = reactivar.map((pg) => resumen(productos[pg.prod]));
  for (const pg of [...reactivar, ...paginasNuevas]) insertar(pg);

  // 4. Resumen del borrador: lo de la consulta al ERP se renueva; las páginas fijas siguen igual.
  const base: ResumenGeneracion = { ...actual.resumen };
  delete base.fuera_de_precio;
  delete base.fuera_de_talla;
  delete base.sin_plantilla;
  delete base.con_generica;
  const resumenNuevo: ResumenGeneracion = { ...base, ...fresco.resumen, ...(actual.resumen.fijas !== undefined ? { fijas: actual.resumen.fijas } : {}), paginas: paginas.length };
  const borrador: Borrador = {
    ...actual,
    productos,
    paginas,
    quitadas,
    resumen: resumenNuevo,
    stock_al: al,
    sincronizacion: { al, actualizados, nuevos: nuevos.length, quitados: quitados.length, reactivados: reactivados.length },
  };
  const informe: InformeSincronizacion = {
    al,
    antes: paginasProducto(actual.paginas).length,
    despues: paginasProducto(paginas).length,
    actualizados,
    cambiosTallas,
    cambiosPrecio,
    sinCambios,
    nuevos,
    quitados,
    reactivados,
    sinPlantilla: fresco.resumen.sin_plantilla ?? {},
    sinImagen: fresco.resumen.sin_imagen ?? [],
  };
  return { borrador, informe };
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

/**
 * «21 set 2026, 10:30» a hora de Lima (Perú no tiene horario de verano). Se arma a mano, sin `Intl`, para que el
 * servidor y el navegador escriban exactamente lo mismo.
 */
export function fechaStock(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const d = new Date(t - 5 * 3600_000);
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`;
}
