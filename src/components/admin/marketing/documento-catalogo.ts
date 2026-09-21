// Arma el «documento» de un catálogo a partir de sus filtros (lógica pura): qué plantilla usa cada marca,
// qué portada lleva, qué separadores se eligieron y qué cierres se ponen solos. Lo usan el paso Plantillas,
// el Preview y el paso final del asistente, para mostrar solo lo que corresponde a esos filtros.
import { CLAVE_PRODUCTOS, MARCA_GENERICA, claveDeMarca, esClaveProductos, fijasAplicables, marcaDeClave, plantillaDeMarca, portadaDelTipo, type FijaBiblioteca, type PlantillaLista } from "@/lib/marketing-catalogo";
import type { MarcaAfectada } from "@/lib/actions/marketing-disenos";

export type FijaGestion = FijaBiblioteca & { activa: boolean; /** Zonas clicables (solo su cantidad importa aquí). */ zonas?: readonly unknown[] };

export type Hoja = {
  id: string;
  etiqueta: string;
  titulo: string;
  detalle?: string;
  /** Ruta en el bucket sin extensión. */
  imagen: string;
  ancho: number;
  alto: number;
  /** true = aparece en el documento pero se ubica a mano (separadores). */
  manual?: boolean;
  /** true = existe la miniatura `<imagen>-min.webp` (las páginas fijas); las plantillas solo tienen la imagen grande. */
  miniatura?: boolean;
};

/** Un elemento del documento, en su orden: una página fija o el bloque de todas las páginas de producto. */
export type ItemDocumento = {
  /** Id de la página fija, CLAVE_PRODUCTOS (todos los productos) o `productos:MARCA` (los de una marca). */
  clave: string;
  tipo: "fija" | "productos" | "productos-marca";
  /** Solo en `productos-marca`. */
  marca?: string;
  etiqueta: string;
  titulo: string;
  detalle?: string;
  /** Una hoja para una fija o un bloque de marca; una por plantilla para el bloque de todos los productos. */
  hojas: Hoja[];
};

/** Una marca del catálogo que tiene plantilla (sus productos entran), con su separador si lo hay. */
export type MarcaBloque = { marca: string; productos: number; plantilla: PlantillaLista; separador: FijaGestion | null };

export type DocumentoCatalogo = {
  tipo: string;
  /** Plantilla que usa cada marca (o la genérica), sin repetir. */
  plantillas: { plantilla: PlantillaLista; marcas: string[]; productos: number }[];
  /** Marcas sin plantilla propia ni genérica: sus productos no entran. */
  sinPlantilla: MarcaAfectada[];
  /** ¿Hay que subir una genérica? (marcas sin plantilla propia y ninguna genérica activa). */
  faltaGenerica: boolean;
  /** Todas las portadas activas, para elegir. */
  portadas: FijaGestion[];
  /** Portada asociada al tipo de catálogo (null si el tipo no tiene o los filtros son personalizados). */
  portadaDelTipo: FijaGestion | null;
  /** Portada que lleva el documento; null = ninguna. */
  portada: FijaGestion | null;
  /** Filtros personalizados sin portada elegida todavía: el asistente la pide (o «sin portada»). */
  portadaPendiente: boolean;
  /** Otras páginas que se ponen solas al inicio y al final. */
  inicio: FijaGestion[];
  final: FijaGestion[];
  /** Separadores que corresponden a este tipo (opcionales) y los que se eligieron. */
  separadores: FijaGestion[];
  separadoresElegidos: FijaGestion[];
  /** Orden efectivo del documento (ids de fijas y CLAVE_PRODUCTOS); es el fijado en el Preview o, si no, el automático. */
  orden: string[];
  /** ¿El orden lo fijó Marketing en el Preview? false = automático. */
  personalizado: boolean;
  secuencia: ItemDocumento[];
  /** Todas las páginas fijas activas: de aquí se agregan al documento. */
  biblioteca: FijaGestion[];
  /** Marcas cuyos productos entran (tienen plantilla), en orden alfabético, con su separador de marca. */
  marcasBloque: MarcaBloque[];
  /** ¿Los productos están separados en un bloque por marca? */
  porMarcas: boolean;
  /** Marcas del catálogo que no tienen separador de marca en la biblioteca. */
  sinSeparador: string[];
  /** ¿No hay ningún separador de marca subido? */
  sinSeparadoresDeMarca: boolean;
  hojas: Hoja[];
};

/** Lo que se muestra de una página fija según su tipo y si va antes o después de los productos. */
function etiquetaFija(f: FijaBiblioteca, antes: boolean): string {
  if (f.tipo === "portada") return "Portada";
  if (f.tipo === "separador") return "Separador";
  return antes ? "Página inicial" : f.tipo === "cierre" ? "Cierre" : "Página final";
}

/**
 * Sin repetidos ni ids que ya no existan. Los productos van en un solo bloque o en uno por marca (nunca ambos): con
 * bloques por marca, las marcas que falten se agregan tras el último; sin ninguno, el bloque único va al final si falta.
 */
function limpiarOrden(orden: readonly string[], existe: (id: string) => boolean, marcas: readonly string[]): string[] {
  const conocidas = new Set(marcas);
  const vistos = new Set<string>();
  const limpio = orden.filter((id) => {
    const m = marcaDeClave(id);
    const valido = m !== null ? conocidas.has(m) : id === CLAVE_PRODUCTOS || existe(id);
    return valido && !vistos.has(id) && vistos.add(id);
  });
  if (limpio.some((id) => marcaDeClave(id) !== null)) {
    const sinUnico = limpio.filter((id) => id !== CLAVE_PRODUCTOS);
    const faltan = marcas.filter((m) => !sinUnico.includes(claveDeMarca(m))).map(claveDeMarca);
    const ultimo = sinUnico.map((id) => marcaDeClave(id) !== null).lastIndexOf(true);
    return [...sinUnico.slice(0, ultimo + 1), ...faltan, ...sinUnico.slice(ultimo + 1)];
  }
  return limpio.includes(CLAVE_PRODUCTOS) ? limpio : [...limpio, CLAVE_PRODUCTOS];
}

/** El orden con los productos separados por marca: un bloque por marca, cada uno precedido por el separador de su marca. */
export function ordenPorMarcas(orden: readonly string[], marcas: readonly MarcaBloque[]): string[] {
  const separadores = new Set(marcas.flatMap((m) => (m.separador ? [m.separador.id] : [])));
  const base = orden.filter((id) => !separadores.has(id));
  const i = base.indexOf(CLAVE_PRODUCTOS);
  if (i === -1) return [...orden];
  const bloques = marcas.flatMap((m) => [...(m.separador ? [m.separador.id] : []), claveDeMarca(m.marca)]);
  return [...base.slice(0, i), ...bloques, ...base.slice(i + 1)];
}

/** El orden con los productos otra vez en un solo bloque (donde estaba el primero); los separadores de marca se quitan. */
export function ordenSinMarcas(orden: readonly string[], idsSeparadoresMarca: ReadonlySet<string>): string[] {
  const salida: string[] = [];
  let puesto = false;
  for (const id of orden) {
    if (marcaDeClave(id) !== null) {
      if (!puesto) salida.push(CLAVE_PRODUCTOS);
      puesto = true;
    } else if (!idsSeparadoresMarca.has(id)) salida.push(id);
  }
  return salida;
}

/** El orden con este separador justo antes del bloque de esa marca (si la marca tiene bloque). */
export function ordenConSeparadorDeMarca(orden: readonly string[], marca: string, id: string): string[] {
  const resto = orden.filter((x) => x !== id);
  const i = resto.indexOf(claveDeMarca(marca));
  return i === -1 ? [...orden] : [...resto.slice(0, i), id, ...resto.slice(i)];
}

/** El orden con esta portada elegida (null = ninguna): sustituye a la que hubiera y va la primera. */
export function ordenConPortada(orden: readonly string[], idsPortadas: ReadonlySet<string>, nueva: string | null): string[] {
  const resto = orden.filter((id) => !idsPortadas.has(id));
  return nueva ? [nueva, ...resto] : resto;
}

/** El orden con un separador marcado (justo antes de los productos) o desmarcado. */
export function ordenConSeparador(orden: readonly string[], id: string, marcado: boolean): string[] {
  const resto = orden.filter((x) => x !== id);
  if (!marcado) return resto;
  const punto = resto.indexOf(CLAVE_PRODUCTOS);
  return punto === -1 ? [...resto, id] : [...resto.slice(0, punto), id, ...resto.slice(punto)];
}

export function documentoDelCatalogo(
  filtros: { tipo: string; plantillas: Record<string, string>; portada?: string | null; separadores?: string[]; orden?: string[] },
  plantillas: readonly PlantillaLista[],
  fijas: readonly FijaGestion[],
  marcasCatalogo: readonly MarcaAfectada[] | null
): DocumentoCatalogo {
  const tipo = filtros.tipo;
  const activas = plantillas.filter((p) => p.activa);
  const propia = (m: string) => activas.some((p) => p.marca === m);
  const hayGenerica = activas.some((p) => p.marca === MARCA_GENERICA);

  // Como en el catálogo: las marcas van en orden alfabético.
  const marcas = [...(marcasCatalogo ?? [])].sort((a, b) => a.marca.localeCompare(b.marca));
  const porPlantilla = new Map<string, { plantilla: PlantillaLista; marcas: string[]; productos: number }>();
  const sinPlantilla: MarcaAfectada[] = [];
  for (const m of marcas) {
    const id = plantillaDeMarca(m.marca, plantillas, filtros.plantillas);
    const plantilla = id ? activas.find((p) => p.id === id) : undefined;
    if (!plantilla) {
      sinPlantilla.push(m);
      continue;
    }
    const previo = porPlantilla.get(plantilla.id) ?? { plantilla, marcas: [], productos: 0 };
    previo.marcas.push(m.marca);
    previo.productos += m.productos;
    porPlantilla.set(plantilla.id, previo);
  }

  const activasFijas = fijas.filter((f) => f.activa);
  const porId = new Map(activasFijas.map((f) => [f.id, f]));
  const portadas = activasFijas.filter((f) => f.tipo === "portada");
  const delTipo = portadaDelTipo(tipo, portadas);
  const ap = fijasAplicables(tipo, activasFijas);

  // Marcas cuyos productos entran (tienen plantilla) y su separador de marca, si lo hay (uno por marca).
  const separadorDe = (marca: string) => activasFijas.find((f) => f.tipo === "separador_marca" && (f.marca ?? "").trim().toUpperCase() === marca);
  const marcasBloque: MarcaBloque[] = [...porPlantilla.values()]
    .flatMap(({ plantilla, marcas: ms }) => ms.map((marca) => ({ plantilla, marca })))
    .map(({ plantilla, marca }) => ({ marca, plantilla, productos: marcas.find((x) => x.marca === marca)?.productos ?? 0, separador: separadorDe(marca) ?? null }))
    .sort((x, y) => x.marca.localeCompare(y.marca));

  // Orden automático: elegida (o «sin portada») > la del tipo; con filtros personalizados no hay ninguna hasta que se elige.
  const portadaAuto = filtros.portada === undefined ? delTipo : (portadas.find((f) => f.id === filtros.portada) ?? null);
  const separadoresAuto = (filtros.separadores ?? []).map((id) => ap.sugeridas.find((f) => f.id === id)).filter((f): f is FijaGestion => Boolean(f));
  const ordenAuto = [...(portadaAuto ? [portadaAuto.id] : []), ...ap.inicio.map((f) => f.id), ...separadoresAuto.map((f) => f.id), CLAVE_PRODUCTOS, ...ap.final.map((f) => f.id)];
  const personalizado = filtros.orden !== undefined;
  const orden = limpiarOrden(personalizado ? filtros.orden! : ordenAuto, (id) => porId.has(id), marcasBloque.map((m) => m.marca));
  const porMarcas = orden.some((id) => marcaDeClave(id) !== null);

  // Con el orden fijado en el Preview, la portada y los separadores son los que hay en él.
  const enOrden = orden.map((id) => porId.get(id)).filter((f): f is FijaGestion => Boolean(f));
  const portada = personalizado ? (enOrden.find((f) => f.tipo === "portada") ?? null) : portadaAuto;
  const separadoresElegidos = personalizado ? enOrden.filter((f) => f.tipo === "separador") : separadoresAuto;
  const portadaPendiente = tipo === "" && filtros.portada === undefined;

  const etiquetaDe = (f: FijaBiblioteca, antes: boolean) => (f.tipo === "separador_marca" ? "Separador de marca" : etiquetaFija(f, antes));
  const hoja = (f: FijaBiblioteca, etiqueta: string): Hoja => ({ id: `f-${f.id}`, etiqueta, titulo: f.nombre, imagen: f.imagen, ancho: f.ancho, alto: f.alto, manual: f.tipo === "separador", miniatura: true });
  const hojaPlantilla = (plantilla: PlantillaLista, id: string, titulo: string, detalle: string): Hoja => ({
    id,
    etiqueta: plantilla.marca === MARCA_GENERICA ? "Plantilla genérica" : "Plantilla",
    titulo,
    detalle,
    imagen: plantilla.fondo,
    ancho: plantilla.ancho,
    alto: plantilla.alto,
  });
  const dePlantillas = [...porPlantilla.values()].map<Hoja>(({ plantilla, marcas: ms, productos }) =>
    hojaPlantilla(plantilla, `p-${plantilla.id}`, plantilla.marca === MARCA_GENERICA ? `${plantilla.nombre} · ${ms.join(", ")}` : `${ms.join(", ")} · ${plantilla.nombre}`, `${productos.toLocaleString("en-US")} productos`)
  );
  const totalProductos = [...porPlantilla.values()].reduce((a, p) => a + p.productos, 0);

  const punto = orden.findIndex(esClaveProductos);
  const secuencia = orden.map<ItemDocumento>((clave, i) => {
    if (clave === CLAVE_PRODUCTOS) {
      return { clave, tipo: "productos", etiqueta: "Productos", titulo: "Páginas de producto, por marca", detalle: `${totalProductos.toLocaleString("en-US")} productos`, hojas: dePlantillas };
    }
    const m = marcaDeClave(clave);
    if (m !== null) {
      const bloque = marcasBloque.find((x) => x.marca === m)!;
      const detalle = `${bloque.productos.toLocaleString("en-US")} ${bloque.productos === 1 ? "producto" : "productos"}`;
      return {
        clave,
        tipo: "productos-marca",
        marca: m,
        etiqueta: "Productos",
        titulo: `${m} · ${bloque.plantilla.nombre}`,
        detalle,
        hojas: [hojaPlantilla(bloque.plantilla, `p-${bloque.plantilla.id}-${m}`, `${m} · ${bloque.plantilla.nombre}`, detalle)],
      };
    }
    const f = porId.get(clave)!;
    const etiqueta = etiquetaDe(f, i < punto);
    return { clave, tipo: "fija", etiqueta, titulo: f.nombre, hojas: [hoja(f, etiqueta)] };
  });

  return {
    tipo,
    plantillas: [...porPlantilla.values()],
    sinPlantilla,
    faltaGenerica: !hayGenerica && marcas.some((m) => !propia(m.marca)),
    portadas,
    portadaDelTipo: delTipo,
    portada,
    portadaPendiente,
    inicio: ap.inicio,
    final: ap.final,
    separadores: ap.sugeridas,
    separadoresElegidos,
    orden,
    personalizado,
    secuencia,
    biblioteca: activasFijas,
    marcasBloque,
    porMarcas,
    sinSeparador: marcasBloque.filter((m) => !m.separador).map((m) => m.marca),
    sinSeparadoresDeMarca: !activasFijas.some((f) => f.tipo === "separador_marca"),
    hojas: secuencia.flatMap((it) => it.hojas),
  };
}
