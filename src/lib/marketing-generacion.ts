// Generación de un catálogo en segundo plano (SOLO servidor). La acción
// `iniciarGeneracion` crea la fila de mk_generaciones y responde al instante;
// esto corre después de la respuesta (`after`) y va dejando la etapa en la
// fila para que la pantalla muestre el avance.
import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { consultarCatalogoErp } from "@/lib/marketing-erp";
import {
  MARCA_GENERICA,
  conFijasAutomaticas,
  construirBorrador,
  normalizarFiltros,
  plantillaDeMarca,
  tipoEfectivo,
  type FijaBiblioteca,
} from "@/lib/marketing-catalogo";
import { fijasDeBiblioteca, plantillasGestion } from "@/lib/marketing-catalogos-datos";

/** El ERP tiene un tope de 4 min; pasado este tiempo una generación en curso se da por perdida. */
export const MINUTOS_ABANDONO = 6;

async function etapa(id: string, nombre: "erp" | "armando" | "guardando"): Promise<void> {
  await db.execute({ sql: "UPDATE mk_generaciones SET etapa = ? WHERE id = ?", args: [nombre, id] });
}

async function terminar(id: string, estado: "listo" | "error", mensaje: string, catalogoId: string | null = null): Promise<void> {
  await db.execute({
    sql: "UPDATE mk_generaciones SET estado = ?, mensaje = ?, catalogo_id = ?, finished_at = now_text() WHERE id = ?",
    args: [estado, mensaje, catalogoId, id],
  });
  revalidatePath("/admin/marketing/catalogos");
}

export async function ejecutarGeneracion(id: string): Promise<void> {
  try {
    const g = await db.execute({ sql: "SELECT titulo, filtros, created_by FROM mk_generaciones WHERE id = ?", args: [id] });
    if (g.rows.length === 0) return;
    const { titulo, filtros: crudo, created_by } = g.rows[0] as { titulo: string; filtros: string; created_by: string | null };
    const filtros = normalizarFiltros(JSON.parse(crudo));

    const plantillas = await plantillasGestion();
    if (!plantillas.some((p) => p.activa)) return await terminar(id, "error", "No hay ninguna plantilla activa");

    await etapa(id, "erp");
    const items = await consultarCatalogoErp(filtros);

    await etapa(id, "armando");
    const codigos = [...new Set(items.map((i) => i.cod_universal?.trim().toUpperCase()).filter((c): c is string => Boolean(c)))];
    const versiones = new Map<string, number>();
    if (codigos.length > 0) {
      const r = await db.execute({
        sql: "SELECT cod_universal, version FROM mk_imagenes WHERE cod_universal = ANY(?)",
        args: [codigos],
      });
      for (const f of r.rows) versiones.set(f.cod_universal as string, f.version as number);
    }

    // Cada marca usa la plantilla elegida (o su predeterminada); sin la suya, la genérica; si tampoco
    // hay genérica, el producto no entra y se avisa en el resumen.
    const sinFijas = construirBorrador(items, versiones, (marca) => plantillaDeMarca(marca, plantillas, filtros.plantillas), {
      min: filtros.precio_min,
      max: filtros.precio_max,
    });
    const conPropia = new Set(plantillas.filter((p) => p.activa && p.marca !== MARCA_GENERICA).map((p) => p.marca));
    const genericas: Record<string, number> = {};
    for (const pg of sinFijas.paginas) {
      if (pg.tipo !== "producto") continue;
      const marca = sinFijas.productos[pg.prod].marca;
      if (!conPropia.has(marca)) genericas[marca || "(SIN MARCA)"] = (genericas[marca || "(SIN MARCA)"] ?? 0) + 1;
    }
    if (Object.keys(genericas).length > 0) sinFijas.resumen.con_generica = genericas;
    if (sinFijas.paginas.length === 0) {
      const r = sinFijas.resumen;
      const fuera = r.fuera_de_precio ? `, ${r.fuera_de_precio} fuera del rango de precio` : "";
      const sinPl = r.sin_plantilla ? `, ${Object.values(r.sin_plantilla).reduce((a, b) => a + b, 0)} de marcas sin plantilla (${Object.keys(r.sin_plantilla).join(", ")})` : "";
      return await terminar(
        id,
        "error",
        `Ningún producto se puede mostrar: el ERP devolvió ${r.erp_items}, ${r.sin_imagen.length} sin imagen, ${r.sin_stock} sin stock o precio${fuera}${sinPl}`
      );
    }
    // Portada al inicio y términos al final, según el tipo de catálogo (se pueden quitar en el editor).
    const borrador = conFijasAutomaticas(sinFijas, tipoEfectivo(filtros), (await fijasDeBiblioteca()) as FijaBiblioteca[]);

    await etapa(id, "guardando");
    const catalogoId = randomUUID();
    await db.execute({
      sql: `INSERT INTO mk_catalogos (id, slug, titulo, filtros, borrador, created_by)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [catalogoId, randomBytes(9).toString("base64url"), titulo, JSON.stringify(filtros), JSON.stringify(borrador), created_by],
    });
    const nSinPlantilla = Object.values(borrador.resumen.sin_plantilla ?? {}).reduce((a, b) => a + b, 0);
    await terminar(
      id,
      "listo",
      `${borrador.paginas.length} páginas generadas${nSinPlantilla > 0 ? ` (${nSinPlantilla} productos sin plantilla de su marca quedaron fuera)` : ""}`,
      catalogoId
    );
  } catch (e) {
    console.error("[marketing] generación falló:", e);
    try {
      await terminar(id, "error", e instanceof Error ? e.message : "No se pudo generar el catálogo");
    } catch (e2) {
      console.error("[marketing] no se pudo registrar el error de la generación:", e2);
    }
  }
}

/** Las generaciones «en curso» que llevan más de MINUTOS_ABANDONO se marcan como interrumpidas (proceso reiniciado o caído). */
export async function cerrarGeneracionesAbandonadas(): Promise<void> {
  await db.execute({
    sql: `UPDATE mk_generaciones
          SET estado = 'error', mensaje = 'La generación se interrumpió; vuelve a intentarlo', finished_at = now_text()
          WHERE estado = 'en_curso' AND created_at::timestamp < now_text()::timestamp - make_interval(mins => ?)`,
    args: [MINUTOS_ABANDONO],
  });
}
