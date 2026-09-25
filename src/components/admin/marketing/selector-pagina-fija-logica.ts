export type ModoSubidaPagina = "biblioteca" | "catalogo" | "ambos";

export function guardaEnBiblioteca(modo: ModoSubidaPagina, marcado: boolean): boolean {
  return modo === "biblioteca" || (modo === "ambos" && marcado);
}

export function posicionEnEditor(donde: string, seleccion: number, total: number): number {
  if (donde === "inicio") return 0;
  if (donde === "despues" && seleccion >= 0) return seleccion + 1;
  return total;
}

export function insertarEnOrden(orden: readonly string[], id: string, posicion: number): string[] {
  if (orden.includes(id)) return [...orden];
  const lugar = Math.max(0, Math.min(posicion, orden.length));
  return [...orden.slice(0, lugar), id, ...orden.slice(lugar)];
}

export function validarArchivoPagina(tipo: string, bytes: number): string | null {
  if (!["image/png", "image/jpeg", "image/webp"].includes(tipo)) return "Elige una imagen JPG, PNG o WebP.";
  if (bytes > 4 * 1024 * 1024) return "La imagen supera el máximo de 4 MB.";
  if (bytes === 0) return "La imagen está vacía.";
  return null;
}

export function posicionAntesDeMarca(orden: readonly string[], claveMarca: string): number {
  const posicion = orden.indexOf(claveMarca);
  return posicion < 0 ? orden.length : posicion;
}
