// Lectura de los tipos de catálogo (tabla `mk_tipos`). Si la tabla aún no existe o está vacía se usan los 9 tipos de
// fábrica del código, así el sistema sigue funcionando aunque el despliegue llegue antes que la migración.
import { db } from "@/lib/db";
import { TIPOS_DE_FABRICA, normalizarFiltrosTipo, type TipoCatalogo } from "@/lib/marketing-catalogo";

export async function tiposCatalogo(opciones: { soloActivos?: boolean } = {}): Promise<TipoCatalogo[]> {
  let tipos: TipoCatalogo[];
  try {
    const r = await db.execute("SELECT id, nombre, descripcion, filtros, base, activo FROM mk_tipos ORDER BY base DESC, orden, created_at");
    tipos =
      r.rows.length > 0
        ? r.rows.map((f) => ({
            id: f.id as string,
            nombre: f.nombre as string,
            descripcion: (f.descripcion as string) ?? "",
            base: f.base === 1,
            activo: f.activo === 1,
            ...normalizarFiltrosTipo(f.filtros),
          }))
        : [...TIPOS_DE_FABRICA];
  } catch {
    tipos = [...TIPOS_DE_FABRICA];
  }
  return opciones.soloActivos ? tipos.filter((t) => t.activo) : tipos;
}

/** Ids de todos los tipos (también los desactivados: un catálogo ya generado puede ser de uno). */
export async function idsDeTipos(): Promise<Set<string>> {
  return new Set((await tiposCatalogo()).map((t) => t.id));
}
