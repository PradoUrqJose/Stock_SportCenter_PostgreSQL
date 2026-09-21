// Generación de un catálogo en segundo plano (SOLO servidor). La acción
// `iniciarGeneracion` crea la fila de mk_generaciones y responde al instante;
// esto corre después de la respuesta (`after`) y va dejando la etapa en la
// fila para que la pantalla muestre el avance.
import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { consultarCatalogoErp } from "@/lib/marketing-erp";
import type { ItemErp } from "@/lib/marketing-catalogo";
import {
  MARCA_GENERICA,
  claveConsultaErp,
  conFijasAutomaticas,
  construirBorrador,
  escalaDe,
  normalizarFiltros,
  plantillaDeMarca,
  tipoEfectivo,
  type Borrador,
  type FijaBiblioteca,
  type FiltrosCatalogo,
} from "@/lib/marketing-catalogo";
import { sincronizarBorrador } from "@/lib/marketing-sincronizar";
import { convertirProductos, textoAviso } from "@/lib/marketing-tallas";
import { indiceDeTallas } from "@/lib/marketing-tallas-datos";
import { borradorDeVersion, fijasDeBiblioteca, plantillasGestion } from "@/lib/marketing-catalogos-datos";

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

/** Minutos que una consulta al ERP hecha por adelantado (mientras se llena el asistente) sigue valiendo. */
const MINUTOS_PRECARGA = 10;

type ConsultaEnMemoria = { items: ItemErp[]; parcial: boolean; al: string };

/**
 * La consulta al ERP con estos filtros que otra petición hizo por adelantado (ver `ejecutarPrecarga`): si ya terminó, se usa; si
 * sigue en curso, se ESPERA a que termine (no se repite la consulta); si no hay ninguna vigente o falló, devuelve null.
 */
async function consultaPrecargada(filtros: FiltrosCatalogo): Promise<ConsultaEnMemoria | null> {
  const clave = claveConsultaErp(filtros);
  const limite = Date.now() + 200_000;
  for (;;) {
    const r = await db.execute({
      sql: `SELECT estado, resultado FROM mk_generaciones
            WHERE modo = 'precarga' AND filtros = ? AND created_at::timestamp > now_text()::timestamp - make_interval(mins => ?)
            ORDER BY created_at DESC LIMIT 1`,
      args: [clave, MINUTOS_PRECARGA],
    });
    if (r.rows.length === 0) return null;
    const f = r.rows[0] as { estado: string; resultado: string | null };
    if (f.estado === "listo" && f.resultado) return JSON.parse(f.resultado) as ConsultaEnMemoria;
    if (f.estado === "error" || Date.now() > limite) return null;
    await new Promise((res) => setTimeout(res, 1000));
  }
}

/**
 * Consulta el ERP por adelantado con estos filtros y deja el resultado en la fila `id` (modo «precarga»). El asistente la pide al
 * pasar de los filtros a las plantillas: cuando se termina de llenar, «Generar» ya la tiene y no espera al ERP.
 */
export async function ejecutarPrecarga(id: string, origen?: string): Promise<void> {
  try {
    const g = await db.execute({ sql: "SELECT filtros FROM mk_generaciones WHERE id = ? AND modo = 'precarga'", args: [id] });
    if (g.rows.length === 0) return;
    const c = JSON.parse(g.rows[0].filtros as string) as { a: string[]; g: string[]; m: string[]; ge: string[]; c: string[] };
    const filtros = normalizarFiltros({ almacenes: c.a, grupos: c.g, marcas: c.m, generos: c.ge, categorias: c.c });
    const { items, parcial } = await consultarCatalogoErp(filtros, origen);
    const resultado: ConsultaEnMemoria = { items, parcial, al: new Date().toISOString() };
    await db.execute({ sql: "UPDATE mk_generaciones SET resultado = ?, estado = 'listo', finished_at = now_text() WHERE id = ?", args: [JSON.stringify(resultado), id] });
  } catch (e) {
    console.error("[marketing] precarga del ERP falló:", e);
    try {
      await db.execute({ sql: "UPDATE mk_generaciones SET estado = 'error', mensaje = ?, finished_at = now_text() WHERE id = ?", args: [e instanceof Error ? e.message : "No se pudo consultar el ERP", id] });
    } catch {
      // Sin poder registrar el error: la fila queda «en curso» y se cierra sola como abandonada.
    }
  }
}

/**
 * Consulta el ERP con estos filtros y arma las páginas de producto (sin portada ni páginas fijas): lo comparten la
 * generación de un catálogo nuevo y la sincronización de uno existente. Va dejando la etapa en la fila `id`. Si el asistente
 * ya consultó el ERP por adelantado con los mismos filtros hace poco, usa ese resultado (y la fecha en que se consultó).
 */
async function borradorDeErp(id: string, filtros: FiltrosCatalogo, origen?: string): Promise<{ borrador: Borrador; consultadoAl: string } | { error: string }> {
  const plantillas = await plantillasGestion();
  if (!plantillas.some((p) => p.activa)) return { error: "No hay ninguna plantilla activa" };

  await etapa(id, "erp");
  const previa = await consultaPrecargada(filtros);
  const consulta = previa ?? { ...(await consultarCatalogoErp(filtros, origen)), al: new Date().toISOString() };
  const { items, parcial } = consulta;

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
    tallas: filtros.tallas,
  });
  const conPropia = new Set(plantillas.filter((p) => p.activa && p.marca !== MARCA_GENERICA).map((p) => p.marca));
  const genericas: Record<string, number> = {};
  for (const pg of sinFijas.paginas) {
    if (pg.tipo !== "producto") continue;
    const marca = sinFijas.productos[pg.prod].marca;
    if (!conPropia.has(marca)) genericas[marca || "(SIN MARCA)"] = (genericas[marca || "(SIN MARCA)"] ?? 0) + 1;
  }
  if (Object.keys(genericas).length > 0) sinFijas.resumen.con_generica = genericas;
  if (parcial) sinFijas.resumen.consulta_parcial = true;
  if (sinFijas.paginas.length === 0) {
    const r = sinFijas.resumen;
    const fuera =
      (r.fuera_de_precio ? `, ${r.fuera_de_precio} fuera del rango de precio` : "") +
      (r.fuera_de_talla ? `, ${r.fuera_de_talla} sin stock en las tallas elegidas (${filtros.tallas.join(", ")})` : "");
    const sinPl = r.sin_plantilla ? `, ${Object.values(r.sin_plantilla).reduce((a, b) => a + b, 0)} de marcas sin plantilla (${Object.keys(r.sin_plantilla).join(", ")})` : "";
    return { error: `Ningún producto se puede mostrar: el ERP devolvió ${r.erp_items}, ${r.sin_stock} sin stock o precio${fuera}${sinPl}` };
  }
  return { borrador: sinFijas, consultadoAl: consulta.al };
}

export async function ejecutarGeneracion(id: string, origen?: string): Promise<void> {
  try {
    const g = await db.execute({ sql: "SELECT titulo, filtros, created_by FROM mk_generaciones WHERE id = ?", args: [id] });
    if (g.rows.length === 0) return;
    const { titulo, filtros: crudo, created_by } = g.rows[0] as { titulo: string; filtros: string; created_by: string | null };
    const filtros = normalizarFiltros(JSON.parse(crudo));

    const armado = await borradorDeErp(id, filtros, origen);
    if ("error" in armado) return await terminar(id, "error", armado.error);
    const sinFijas = armado.borrador;
    // Portada al inicio (la elegida o la del tipo), separadores elegidos y términos al final (se pueden quitar en el editor).
    const borrador: Borrador = {
      ...conFijasAutomaticas(sinFijas, tipoEfectivo(filtros), (await fijasDeBiblioteca()) as FijaBiblioteca[], {
        portada: filtros.portada,
        separadores: filtros.separadores,
        orden: filtros.orden,
      }),
      // Los datos de stock y precio son de cuando se consultó el ERP; el catálogo publicado lo dirá.
      stock_al: armado.consultadoAl,
    };

    await etapa(id, "guardando");
    const catalogoId = randomUUID();
    await db.execute({
      sql: `INSERT INTO mk_catalogos (id, slug, titulo, filtros, borrador, created_by)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [catalogoId, randomBytes(9).toString("base64url"), titulo, JSON.stringify(filtros), JSON.stringify(borrador), created_by],
    });
    const nSinPlantilla = Object.values(borrador.resumen.sin_plantilla ?? {}).reduce((a, b) => a + b, 0);
    // Tallas peruanas: lo que no tenga equivalencia sale con talla USA y se avisa.
    const sinEquivalencia = escalaDe(filtros) === "peru" ? convertirProductos(borrador.productos, await indiceDeTallas(), "peru").avisos : [];
    const avisos = [
      nSinPlantilla > 0 ? `${nSinPlantilla} productos sin plantilla de su marca quedaron fuera` : "",
      borrador.resumen.sin_imagen.length > 0 ? `${borrador.resumen.sin_imagen.length} con la imagen por agregar` : "",
      sinEquivalencia.length > 0 ? `talla USA por falta de equivalencia: ${sinEquivalencia.slice(0, 4).map(textoAviso).join(" | ")}${sinEquivalencia.length > 4 ? ` y ${sinEquivalencia.length - 4} más` : ""}` : "",
      borrador.resumen.consulta_parcial ? "consulta repartida por marca: pudieron faltar marcas que STOCK no conoce" : "",
      (borrador.resumen.sin_explicar ?? 0) !== 0 ? `${borrador.resumen.sin_explicar} filas del ERP sin explicación` : "",
    ].filter(Boolean);
    await terminar(id, "listo", `${borrador.paginas.length} páginas generadas${avisos.length > 0 ? ` (${avisos.join("; ")})` : ""}`, catalogoId);
  } catch (e) {
    console.error("[marketing] generación falló:", e);
    try {
      await terminar(id, "error", e instanceof Error ? e.message : "No se pudo generar el catálogo");
    } catch (e2) {
      console.error("[marketing] no se pudo registrar el error de la generación:", e2);
    }
  }
}


/**
 * Sincronización con el ERP: consulta el ERP con los filtros de la fila `id` (los del catálogo, posiblemente
 * editados) y deja en la fila el resultado y el informe de cambios contra el borrador que se está actualizando.
 * NO modifica el catálogo: eso lo hace `aplicarSincronizacion`, cuando Marketing revisa el informe.
 */
export async function ejecutarSincronizacion(id: string, origen?: string): Promise<void> {
  let catalogoId: string | null = null;
  try {
    const g = await db.execute({ sql: "SELECT filtros, base_catalogo_id, base_version FROM mk_generaciones WHERE id = ? AND modo = 'sincronizar'", args: [id] });
    if (g.rows.length === 0) return;
    const { filtros: crudo, base_catalogo_id, base_version } = g.rows[0] as { filtros: string; base_catalogo_id: string | null; base_version: number | null };
    if (!base_catalogo_id) return await terminar(id, "error", "El catálogo ya no existe");
    catalogoId = base_catalogo_id;
    const filtros = normalizarFiltros(JSON.parse(crudo));

    const armado = await borradorDeErp(id, filtros, origen);
    if ("error" in armado) {
      // Con el ERP vacío o sin respuesta NO se sincroniza: se quitaría todo el catálogo.
      return await terminar(id, "error", `${armado.error}. No se cambió nada del catálogo.`, base_catalogo_id);
    }
    const fresco = armado.borrador;

    await etapa(id, "guardando");
    const actual = await borradorBase(base_catalogo_id, base_version);
    if (!actual) return await terminar(id, "error", "La versión que se iba a sincronizar ya no existe", base_catalogo_id);
    const al = armado.consultadoAl;
    const { informe } = sincronizarBorrador(actual, fresco, al);
    await db.execute({ sql: "UPDATE mk_generaciones SET resultado = ? WHERE id = ?", args: [JSON.stringify({ al, fresco, informe }), id] });
    await terminar(
      id,
      "listo",
      `${informe.actualizados} con cambios, ${informe.nuevos.length} nuevos, ${informe.quitados.length} para quitar`,
      base_catalogo_id
    );
  } catch (e) {
    console.error("[marketing] sincronización falló:", e);
    try {
      await terminar(id, "error", e instanceof Error ? e.message : "No se pudo sincronizar con el ERP", catalogoId);
    } catch (e2) {
      console.error("[marketing] no se pudo registrar el error de la sincronización:", e2);
    }
  }
}

/** El borrador que se sincroniza: el de la versión indicada o, sin versión, el borrador inicial del catálogo. */
export async function borradorBase(catalogoId: string, version: number | null): Promise<Borrador | null> {
  if (version === null) {
    const c = await db.execute({ sql: "SELECT borrador FROM mk_catalogos WHERE id = ?", args: [catalogoId] });
    return c.rows.length === 0 ? null : (JSON.parse(c.rows[0].borrador as string) as Borrador);
  }
  return (await borradorDeVersion(catalogoId, version))?.borrador ?? null;
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
