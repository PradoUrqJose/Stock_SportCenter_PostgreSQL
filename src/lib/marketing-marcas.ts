// Marcas verificadas en el ERP que Marketing necesita poder configurar antes de importar sus productos.
// Son datos del catálogo de marcas, no excepciones en la planificación de consultas ni plantillas.
export const MARCAS_REGISTRADAS_MARKETING = ["CIRCA", "OLYMPIKUS", "SALOMON", "KULTURE", "SQUEEZE"] as const;

/** Conserva primero las marcas frecuentes y añade las registradas o configuradas, sin duplicados ni espacios invisibles. */
export function combinarMarcasMarketing(...fuentes: readonly (readonly string[])[]): string[] {
  const marcas = new Set<string>();
  for (const fuente of [...fuentes, MARCAS_REGISTRADAS_MARKETING]) {
    for (const valor of fuente) {
      const marca = valor.replace(/\s+/g, " ").trim().toUpperCase();
      if (marca && marca !== "*") marcas.add(marca);
    }
  }
  return [...marcas];
}
