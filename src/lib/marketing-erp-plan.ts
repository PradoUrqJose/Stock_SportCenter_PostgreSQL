// Un solo planificador para todos los tipos de catálogo. No conoce «niños», «ropa», etc.
export const DIMENSIONES_ERP = ["marcas", "generos", "grupos", "categorias"] as const;
export type DimensionErp = (typeof DIMENSIONES_ERP)[number];
export type ConsultaErp = Record<DimensionErp, string[]>;
export type OpcionErp = { valor: string; nombre: string };
export type OpcionesErp = Record<DimensionErp, OpcionErp[]>;
export type ConteoErp = { marca: string; genero: string; grupo: string; categoria: string; n: number };
export type FiltrosErp = ConsultaErp & { almacenes: readonly string[]; fecha_minima_ingreso?: string | null; stock_minimo?: number };
export type PlanErp = { consultas: ConsultaErp[]; parcial: false; estimadas: number[] };

const COLUMNA = { marcas: "marca", generos: "genero", grupos: "grupo", categorias: "categoria" } as const;
const MARGEN = 1.3;
const OBJETIVO = 250;
const MAXIMO_ORIENTATIVO = 500;
const normal = (s: string) => s.trim().toUpperCase();
export const valorMarcaErp = (s: string) => normal(s).replace(/\s+/g, "");
const lista = (xs: readonly string[]) => [...new Set(xs.map(normal).filter(Boolean))].sort();

/** Orientación según las mediciones completas de octubre (incluyen preparación y descarga). No es un SLA del ERP. */
export const segundosConsultaErp = (n: number) => 2 + Math.max(0, n) * 0.14;

export function claveConsultaErp(f: FiltrosErp): string {
  return JSON.stringify({ v: 3, a: lista(f.almacenes), g: lista(f.grupos), m: lista(f.marcas.map(valorMarcaErp)), ge: lista(f.generos), c: lista(f.categorias), d: f.fecha_minima_ingreso ?? "", s: f.stock_minimo ?? 1 });
}

export function opcionesErp(val: unknown): OpcionesErp {
  if (!val || typeof val !== "object") throw new Error("No se pudieron verificar los filtros disponibles en el ERP");
  const o = (val as { opciones?: unknown }).opciones as OpcionesErp | undefined;
  if (!o || DIMENSIONES_ERP.some((d) => !Array.isArray(o[d]) || !o[d].length || o[d].some((x) => !x || typeof x.valor !== "string" || typeof x.nombre !== "string"))) {
    throw new Error("El ERP devolvió una lista de filtros incompleta; se canceló la consulta");
  }
  return o;
}

/** Se acepta el nombre visible o el código oficial. Un nombre desconocido nunca se convierte en «todos». */
export function valorFiltroErp(d: DimensionErp, nombre: string, opciones: OpcionesErp): string {
  const buscado = d === "marcas" ? valorMarcaErp(nombre) : normal(nombre);
  const igual = (s: string) => (d === "marcas" ? valorMarcaErp(s) : normal(s)) === buscado;
  const coincidencias = opciones[d].filter((x) => igual(x.valor) || igual(x.nombre));
  const valores = [...new Set(coincidencias.map((x) => x.valor))];
  if (valores.length !== 1 || !valores[0].trim()) throw new Error(`El filtro «${nombre}» de ${d} no tiene un código válido y único en el ERP`);
  return valores[0];
}

function peso(conteos: readonly ConteoErp[], c: ConsultaErp): number {
  return conteos.reduce((n, fila) => n + (DIMENSIONES_ERP.every((d) => c[d].length === 0 || c[d].includes(fila[COLUMNA[d]])) ? fila.n : 0), 0);
}

/** Empieza por lo pesado; los índices mantienen estable el orden al reunir resultados. */
export function ordenEjecucionErp(conteos: readonly ConteoErp[], consultas: readonly ConsultaErp[]): number[] {
  const estimadas = consultas.map((c) => peso(conteos, c));
  return consultas.map((_, i) => i).sort((a, b) => estimadas[b] - estimadas[a] || a - b);
}

export function prepararConteosErp(conteos: readonly ConteoErp[], opciones: OpcionesErp): ConteoErp[] {
  return conteos.map((fila) => {
    const salida = { ...fila };
    for (const d of DIMENSIONES_ERP) {
      try { salida[COLUMNA[d]] = valorFiltroErp(d, fila[COLUMNA[d]], opciones); }
      catch { /* Un valor local desconocido impide expandir esa dimensión; nunca demuestra ausencia en el ERP. */ }
    }
    return salida;
  });
}

/**
 * Se divide cualquier lista OR con el mismo algoritmo. Si no basta, se usa una dimensión del formulario oficial del ERP.
 * No se enumeran marcas/géneros a partir de STOCK. Almacenes, fecha y stock mínimo se conservan: dividir almacenes
 * cambiaría el stock agregado y haría incorrectos tanto el mínimo como «solo únicos».
 */
export function planificarConsultas(conteos: readonly ConteoErp[], filtros: ConsultaErp, opciones: OpcionesErp): PlanErp {
  const raiz = Object.fromEntries(DIMENSIONES_ERP.map((d) => [d, [...new Set(filtros[d].map((x) => valorFiltroErp(d, x, opciones)))].sort()])) as ConsultaErp;
  const filas = prepararConteosErp(conteos, opciones);
  const consultas: ConsultaErp[] = [];
  const estimadas: number[] = [];

  const dividir = (c: ConsultaErp, d: DimensionErp): ConsultaErp[] => {
    // Dos mitades por peso; los valores sin stock local también se incluyen exactamente una vez.
    const valores = c[d].map((v) => ({ v, n: peso(filas, { ...c, [d]: [v] }) })).sort((a, b) => b.n - a.n || a.v.localeCompare(b.v));
    const mitades: { valores: string[]; n: number }[] = [{ valores: [], n: 0 }, { valores: [], n: 0 }];
    for (const { v, n } of valores) {
      const destino = mitades[0].n < mitades[1].n || (mitades[0].n === mitades[1].n && mitades[0].valores.length <= mitades[1].valores.length) ? 0 : 1;
      mitades[destino].valores.push(v); mitades[destino].n += n;
    }
    return mitades.filter((m) => m.valores.length).map((m) => ({ ...c, [d]: m.valores.sort() }));
  };
  const visitar = (c: ConsultaErp) => {
    const n = peso(filas, c) * MARGEN;
    if (n > OBJETIVO) {
      // Primero se subdivide lo elegido. Nunca se añaden valores fuera del filtro pedido.
      const candidatos = DIMENSIONES_ERP.filter((d) => c[d].length > 1).map((d) => ({ d, partes: dividir(c, d) }));
      candidatos.sort((a, b) => Math.max(...a.partes.map((p) => peso(filas, p))) - Math.max(...b.partes.map((p) => peso(filas, p))) || DIMENSIONES_ERP.indexOf(a.d) - DIMENSIONES_ERP.indexOf(b.d));
      if (candidatos.length) { candidatos[0].partes.forEach(visitar); return; }
      if (n > MAXIMO_ORIENTATIVO) {
        // No se expande un universo con códigos vacíos ni con valores locales que el ERP no ofrece.
        const expandibles = DIMENSIONES_ERP.filter((d) => c[d].length === 0 && opciones[d].length > 1 && opciones[d].every((o) => o.valor.trim()) && filas.filter((r) => peso([r], c) > 0).every((r) => opciones[d].some((o) => o.valor === r[COLUMNA[d]])));
        const expansiones = expandibles.map((d) => ({ d, partes: dividir({ ...c, [d]: [...new Set(opciones[d].map((o) => o.valor))] }, d) }));
        expansiones.sort((a, b) => Math.max(...a.partes.map((p) => peso(filas, p))) - Math.max(...b.partes.map((p) => peso(filas, p))) || DIMENSIONES_ERP.indexOf(a.d) - DIMENSIONES_ERP.indexOf(b.d));
        if (expansiones.length) { expansiones[0].partes.forEach(visitar); return; }
      }
    }
    consultas.push(c); estimadas.push(n);
  };
  visitar(raiz);
  return { consultas, parcial: false, estimadas };
}
