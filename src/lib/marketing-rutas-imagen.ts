/** Una ruta por producto y tamaño; la revisión se usa solo para la caché. */
export function codigoImagen(codigo: string): string {
  return codigo === '400497_07' ? '400497-07' : codigo;
}

export function claveDerivado(ancho: 600 | 1200, codigo: string): string {
  return `derivados/w${ancho}/${codigoImagen(codigo)}.webp`;
}

export function urlDerivado(base: string, ancho: 600 | 1200, codigo: string, revision: number): string {
  return `${base.replace(/\/+$/, "")}/derivados/w${ancho}/${encodeURIComponent(codigoImagen(codigo))}.webp?v=${revision}`;
}
