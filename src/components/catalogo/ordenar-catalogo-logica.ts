import type { FijaBiblioteca, PaginaCat, PaginaFija, ProductoCat } from "@/lib/marketing-catalogo";

export type BloqueOrden = {
  id: string;
  inicio: number;
  paginas: PaginaCat[];
  tipo: "fija" | "productos" | "marca";
  marca?: string;
};

export function marcaDePagina(pagina: PaginaCat, productos: readonly ProductoCat[]): string {
  return pagina.tipo === "producto" ? productos[pagina.prod]?.marca?.trim().toUpperCase() || "SIN MARCA" : "";
}

/** En el modo inicial, todos los productos consecutivos forman un solo bloque. */
export function bloquesDe(paginas: readonly PaginaCat[], productos: readonly ProductoCat[], separado: boolean): BloqueOrden[] {
  const bloques: BloqueOrden[] = [];
  paginas.forEach((pagina, inicio) => {
    const anterior = bloques.at(-1);
    if (pagina.tipo === "producto") {
      const marca = marcaDePagina(pagina, productos);
      const tipo = separado ? "marca" : "productos";
      if (anterior?.tipo === tipo && (!separado || anterior.marca === marca)) {
        anterior.paginas.push(pagina);
      } else {
        bloques.push({ id: pagina.id, inicio, paginas: [pagina], tipo, ...(separado ? { marca } : {}) });
      }
    } else {
      bloques.push({ id: pagina.id, inicio, paginas: [pagina], tipo: "fija" });
    }
  });
  return bloques;
}

export function marcasDe(paginas: readonly PaginaCat[], productos: readonly ProductoCat[]): string[] {
  return [...new Set(paginas.filter((p) => p.tipo === "producto").map((p) => marcaDePagina(p, productos)))];
}

/** Separa el bloque único y añade el separador de marca disponible delante de cada marca. */
export function separarPorMarcas(
  paginas: readonly PaginaCat[], productos: readonly ProductoCat[], biblioteca: readonly FijaBiblioteca[], crearId: () => string
): PaginaCat[] {
  const marcas = new Set(marcasDe(paginas, productos));
  const separadoresExistentes = new Map<string, PaginaFija>();
  const reubicados = new Set<string>();
  paginas.forEach((pagina) => {
    if (pagina.tipo !== "fija") return;
    const fija = biblioteca.find((f) => f.tipo === "separador_marca" && f.imagen === pagina.imagen);
    const marca = fija?.marca?.trim().toUpperCase();
    if (marca && marcas.has(marca) && !separadoresExistentes.has(marca)) {
      separadoresExistentes.set(marca, pagina);
      reubicados.add(pagina.id);
    }
  });
  const base = paginas.filter((p) => !reubicados.has(p.id));
  const bloques = bloquesDe(base, productos, false);
  const existentes = new Set(base.filter((p): p is PaginaFija => p.tipo === "fija").map((p) => p.imagen));
  return bloques.flatMap((bloque) => {
    if (bloque.tipo !== "productos") return bloque.paginas;
    const grupos = new Map<string, PaginaCat[]>();
    bloque.paginas.forEach((pagina) => {
      const marca = marcaDePagina(pagina, productos);
      grupos.set(marca, [...(grupos.get(marca) ?? []), pagina]);
    });
    return [...grupos].flatMap(([marca, paginasMarca]) => {
      const anterior = separadoresExistentes.get(marca);
      if (anterior) return [anterior, ...paginasMarca];
      const separador = biblioteca.find((f) => f.tipo === "separador_marca" && f.marca?.trim().toUpperCase() === marca && !existentes.has(f.imagen));
      if (!separador) return paginasMarca;
      existentes.add(separador.imagen);
      return [{ id: crearId(), tipo: "fija" as const, imagen: separador.imagen, ancho: separador.ancho, alto: separador.alto }, ...paginasMarca];
    });
  });
}

export function moverBloque(paginas: readonly PaginaCat[], bloques: readonly BloqueOrden[], id: string, destino: number): PaginaCat[] {
  const desde = bloques.findIndex((b) => b.id === id);
  if (desde < 0 || destino === desde || destino === desde + 1 || destino < 0 || destino > bloques.length) return [...paginas];
  const bloque = bloques[desde];
  const insercion = destino > desde ? bloques[destino]?.inicio ?? paginas.length : bloques[destino].inicio;
  const ids = new Set(bloque.paginas.map((p) => p.id));
  const resto = paginas.filter((p) => !ids.has(p.id));
  resto.splice(insercion > bloque.inicio ? insercion - bloque.paginas.length : insercion, 0, ...bloque.paginas);
  return resto;
}

export function insertarFija(paginas: readonly PaginaCat[], fija: FijaBiblioteca, posicion: number, id: string): PaginaCat[] {
  const nuevas = [...paginas];
  nuevas.splice(Math.max(0, Math.min(posicion, nuevas.length)), 0, { id, tipo: "fija", imagen: fija.imagen, ancho: fija.ancho, alto: fija.alto });
  return nuevas;
}

export function quitarPagina(paginas: readonly PaginaCat[], quitadas: readonly PaginaCat[], id: string): { paginas: PaginaCat[]; quitadas: PaginaCat[] } {
  const pagina = paginas.find((p) => p.id === id);
  if (!pagina) return { paginas: [...paginas], quitadas: [...quitadas] };
  return { paginas: paginas.filter((p) => p.id !== id), quitadas: [...quitadas, pagina] };
}

/** Abre automáticamente los bloques si ya hay páginas fijas entre productos. */
export function tieneProductosIntercalados(paginas: readonly PaginaCat[]): boolean {
  const primero = paginas.findIndex((p) => p.tipo === "producto");
  const ultimo = paginas.findLastIndex((p) => p.tipo === "producto");
  return primero >= 0 && paginas.slice(primero, ultimo + 1).some((p) => p.tipo === "fija");
}

export function rotuloMarca(marca: string): string {
  return marca.trim().toUpperCase().slice(0, 24) || "SIN MARCA";
}

export function rutaLogoMarca(marca: string, logos: readonly { marca: string; archivo: string }[]): string | null {
  const clave = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
  const archivo = logos.find((logo) => clave(logo.marca) === clave(marca))?.archivo;
  return archivo && /^[a-z0-9-]+\.svg$/.test(archivo) ? `/marcas/${archivo}` : null;
}

export function svgLogoMarca(marca: string): string {
  const rotulo = rotuloMarca(marca).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const tamano = rotulo.length > 15 ? 11 : rotulo.length > 10 ? 14 : 19;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" role="img"><rect x="5" y="5" width="150" height="80" rx="9" fill="#101e29" stroke="#287da5"/><path d="M18 20h36M106 70h36" stroke="#38bdf8" stroke-width="3" stroke-linecap="round"/><text x="80" y="49" text-anchor="middle" dominant-baseline="middle" fill="#e0f2fe" font-family="Arial,sans-serif" font-size="${tamano}" font-weight="800"${rotulo.length > 18 ? ' textLength="130" lengthAdjust="spacingAndGlyphs"' : ""}>${rotulo}</text></svg>`;
}
