// Arma el «documento» de un catálogo a partir de sus filtros (lógica pura): qué plantilla usa cada marca,
// qué portada y cierres se ponen solos y qué separadores se sugieren. Lo usan el paso Plantillas, el Preview y
// el paso final del asistente, para mostrar solo lo que corresponde a esos filtros.
import { MARCA_GENERICA, fijasAplicables, plantillaDeMarca, tipoEfectivo, type FijaBiblioteca, type PlantillaLista } from "@/lib/marketing-catalogo";
import type { MarcaAfectada } from "@/lib/actions/marketing-disenos";

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
  inicio: (FijaBiblioteca & { activa: boolean })[];
  final: (FijaBiblioteca & { activa: boolean })[];
  sugeridas: (FijaBiblioteca & { activa: boolean })[];
  hojas: Hoja[];
};

export function documentoDelCatalogo(
  filtros: { tipo: string; generos: string[]; categorias: string[]; plantillas: Record<string, string> },
  plantillas: readonly PlantillaLista[],
  fijas: readonly (FijaBiblioteca & { activa: boolean })[],
  marcasCatalogo: readonly MarcaAfectada[] | null
): DocumentoCatalogo {
  const tipo = tipoEfectivo(filtros);
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
  const ap = fijasAplicables(tipo, activasFijas);
  const enriquecer = (l: FijaBiblioteca[]) => l as (FijaBiblioteca & { activa: boolean })[];

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
    inicio: enriquecer(ap.inicio),
    final: enriquecer(ap.final),
    sugeridas: enriquecer(ap.sugeridas),
    hojas: [
      ...ap.inicio.map((f) => hoja(f, f.tipo === "portada" ? "Portada" : "Página inicial")),
      ...dePlantillas,
      ...ap.sugeridas.map((f) => hoja(f, "Separador · lo ubicas en el editor", true)),
      ...ap.final.map((f) => hoja(f, f.tipo === "cierre" ? "Cierre" : "Página final")),
    ],
  };
}
