// Arma el «documento» de un catálogo a partir de sus filtros (lógica pura): qué plantilla usa cada marca,
// qué portada lleva, qué separadores se eligieron y qué cierres se ponen solos. Lo usan el paso Plantillas,
// el Preview y el paso final del asistente, para mostrar solo lo que corresponde a esos filtros.
import { MARCA_GENERICA, fijasAplicables, plantillaDeMarca, portadaDelTipo, type FijaBiblioteca, type PlantillaLista } from "@/lib/marketing-catalogo";
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
};

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
  hojas: Hoja[];
};

export function documentoDelCatalogo(
  filtros: { tipo: string; plantillas: Record<string, string>; portada?: string | null; separadores?: string[] },
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
  const portadas = activasFijas.filter((f) => f.tipo === "portada");
  const delTipo = portadaDelTipo(tipo, portadas);
  // Elegida (o «sin portada») > la del tipo. Con filtros personalizados no hay ninguna hasta que se elige.
  const portada = filtros.portada === undefined ? delTipo : (portadas.find((f) => f.id === filtros.portada) ?? null);
  const portadaPendiente = tipo === "" && filtros.portada === undefined;
  const ap = fijasAplicables(tipo, activasFijas);
  const separadoresElegidos = (filtros.separadores ?? []).map((id) => ap.sugeridas.find((f) => f.id === id)).filter((f): f is FijaGestion => Boolean(f));

  const hoja = (f: FijaBiblioteca, etiqueta: string, manual = false): Hoja => ({ id: `f-${f.id}`, etiqueta, titulo: f.nombre, imagen: f.imagen, ancho: f.ancho, alto: f.alto, manual });
  const dePlantillas = [...porPlantilla.values()].map<Hoja>(({ plantilla, marcas: ms, productos }) => ({
    id: `p-${plantilla.id}`,
    etiqueta: plantilla.marca === MARCA_GENERICA ? "Plantilla genérica" : "Plantilla",
    titulo: plantilla.marca === MARCA_GENERICA ? `${plantilla.nombre} · ${ms.join(", ")}` : `${ms.join(", ")} · ${plantilla.nombre}`,
    detalle: `${productos.toLocaleString("en-US")} productos`,
    imagen: plantilla.fondo,
    ancho: plantilla.ancho,
    alto: plantilla.alto,
  }));

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
    hojas: [
      ...(portada ? [hoja(portada, "Portada")] : []),
      ...ap.inicio.map((f) => hoja(f, "Página inicial")),
      ...separadoresElegidos.map((f) => hoja(f, "Separador · lo ubicas en el editor", true)),
      ...dePlantillas,
      ...ap.final.map((f) => hoja(f, f.tipo === "cierre" ? "Cierre" : "Página final")),
    ],
  };
}
