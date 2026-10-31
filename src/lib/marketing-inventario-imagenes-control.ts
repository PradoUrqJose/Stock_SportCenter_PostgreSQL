export type ImagenIndice = { codigo: string; version: number };
export type IndiceImagenes = {
  leer: (codigos: string[]) => Promise<ImagenIndice[]>;
  registrar: (codigos: string[]) => Promise<ImagenIndice[]>;
};

/** R2 decide existencia; la tabla solo aporta versiones y se repara sin borrar historial. */
export async function reconciliarIndiceImagenes(codigosR2: readonly string[], indice: IndiceImagenes) {
  const codigos = [...new Set(codigosR2)];
  if (!codigos.length) return { versiones: new Map<string, number>(), registradas: 0 };
  const existentes = new Map((await indice.leer(codigos)).map((i) => [i.codigo, i.version]));
  const faltan = codigos.filter((c) => !(Number(existentes.get(c)) > 0));
  if (faltan.length) {
    for (const i of await indice.registrar(faltan)) existentes.set(i.codigo, i.version);
  }
  const versiones = new Map<string, number>();
  for (const codigo of codigos) {
    const version = existentes.get(codigo);
    if (!version || version < 1) throw new Error(`No se pudo registrar la imagen existente en R2: ${codigo}`);
    versiones.set(codigo, version);
  }
  return { versiones, registradas: faltan.length };
}

/** La ausencia actual en R2 elimina la imagen del borrador aunque exista una fila antigua. */
export function versionImagenDisponible(codigo: string, versiones: ReadonlyMap<string, number>) {
  const normal = codigo.trim().toUpperCase();
  return versiones.get(normal === "400497_07" ? "400497-07" : normal) ?? 0;
}
