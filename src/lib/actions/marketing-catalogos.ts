"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { after } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { IMAGENES_BASE, enlacesCatalogo, sesionMarketing } from "@/lib/marketing";
import { borradorDeVersion, enlacesDeContacto, plantillasPorId, sincronizarVersiones, zonasDeBiblioteca } from "@/lib/marketing-catalogos-datos";
import { cerrarGeneracionesAbandonadas, ejecutarGeneracion } from "@/lib/marketing-generacion";
import { generarImagenCompartir } from "@/lib/marketing-og";
import { etiquetaCatalogo } from "@/lib/marketing-publico";
import { idsDeTipos } from "@/lib/marketing-tipos";
import { precioFiltro, valoresFiltro, valoresTalla } from "@/lib/marketing-validar";
import {
  ALMACENES,
  armarSnapshot,
  CLAVE_PRODUCTOS,
  conZonasClicables,
  validarPaginas,
  type Borrador,
  type FiltrosCatalogo,
} from "@/lib/marketing-catalogo";
import type { ActionResult } from "@/types";

/**
 * Pide generar un catálogo y responde al instante: el trabajo (consultar el
 * ERP, armar las páginas) corre en segundo plano y la pantalla lo sigue con
 * `estadoGeneracion`.
 */
export async function iniciarGeneracion(input: {
  titulo: string;
  tipo: string;
  almacenes: string[];
  grupos: string[];
  marcas: string[];
  generos: string[];
  categorias: string[];
  /** Tallas (escala USA del ERP); vacío = sin filtro. Entra el producto con stock en alguna. */
  tallas?: string[];
  precio_min: number | null;
  precio_max: number | null;
  /** Plantilla elegida por marca (marca → id); la clave «*» es la genérica. */
  plantillas?: Record<string, string>;
  /** Portada elegida (id de página fija); null = sin portada; sin definir = la asociada al tipo. */
  portada?: string | null;
  /** Separadores elegidos (ids de páginas fijas). */
  separadores?: string[];
  /** Orden del documento fijado en el Preview: ids de páginas fijas y «productos» (ver `FiltrosCatalogo.orden`). */
  orden?: string[];
}): Promise<ActionResult<{ id: string }>> {
  const sesion = await sesionMarketing();
  if (!sesion) return { success: false, msg: "Sin permisos" };

  const titulo = String(input.titulo ?? "").trim();
  if (titulo.length < 3 || titulo.length > 100) return { success: false, msg: "El título debe tener entre 3 y 100 caracteres" };

  const almacenes = valoresFiltro(input.almacenes)?.filter((a): a is (typeof ALMACENES)[number] => (ALMACENES as readonly string[]).includes(a));
  const grupos = valoresFiltro(input.grupos);
  const marcas = valoresFiltro(input.marcas);
  const generos = valoresFiltro(input.generos);
  const categorias = valoresFiltro(input.categorias);
  if (!almacenes || almacenes.length === 0) return { success: false, msg: "Elige al menos un almacén" };
  if (!grupos || !marcas || !generos || !categorias) return { success: false, msg: "Filtro con caracteres no válidos" };

  const tallas = valoresTalla(input.tallas ?? []);
  if (!tallas) return { success: false, msg: "Talla con caracteres no válidos" };

  const precio_min = precioFiltro(input.precio_min);
  const precio_max = precioFiltro(input.precio_max);
  if (precio_min === undefined || precio_max === undefined) return { success: false, msg: "El precio debe ser un número válido" };
  if (precio_min != null && precio_max != null && precio_min > precio_max) {
    return { success: false, msg: "El precio mínimo no puede ser mayor que el máximo" };
  }
  const tipo = (await idsDeTipos()).has(input.tipo) ? input.tipo : "";

  // Plantillas elegidas por marca: solo se aceptan pares con formato de marca e id (el resto lo valida la generación).
  const plantillas: Record<string, string> = {};
  for (const [marca, pid] of Object.entries(input.plantillas ?? {}).slice(0, 60)) {
    if (/^[A-Z0-9 &.*-]{1,40}$/.test(marca) && /^[a-z0-9-]{1,80}$/.test(String(pid))) plantillas[marca] = String(pid);
  }

  // Portada y separadores: ids de páginas fijas (la generación ignora los que no existan o no sean del tipo).
  const ID_FIJA = /^[a-z0-9-]{1,60}$/;
  if (input.portada != null && !ID_FIJA.test(String(input.portada))) return { success: false, msg: "Portada no válida" };
  const separadores = (Array.isArray(input.separadores) ? input.separadores : []).filter((x) => ID_FIJA.test(String(x))).slice(0, 20).map(String);

  const orden = Array.isArray(input.orden) ? [...new Set(input.orden.map(String))].filter((x) => ID_FIJA.test(x) || x === CLAVE_PRODUCTOS || /^productos:[\p{L}\p{N} &.'*-]{1,40}$/u.test(x)).slice(0, 60) : [];

  // Sin ningún filtro se traería todo el ERP (miles de filas): se evita por error.
  if (grupos.length + marcas.length + generos.length + categorias.length === 0) {
    return { success: false, msg: "Elige un tipo de catálogo o al menos una marca, un grupo, un género o una categoría" };
  }
  if (!(await rateLimit(`mk-generar:${sesion.id}`, 6, 60_000))) {
    return { success: false, msg: "Demasiadas generaciones seguidas; espera un minuto" };
  }

  try {
    // Una a la vez: cada una consulta el ERP y arma cientos de páginas.
    await cerrarGeneracionesAbandonadas();
    const activa = await db.execute("SELECT id, titulo FROM mk_generaciones WHERE estado = 'en_curso' LIMIT 1");
    if (activa.rows.length > 0) {
      return { success: false, msg: `Ya hay una generación en curso («${activa.rows[0].titulo}»); espera a que termine` };
    }

    const filtros: FiltrosCatalogo = {
      tipo,
      almacenes,
      grupos,
      marcas,
      generos,
      categorias,
      tallas,
      precio_min,
      precio_max,
      plantillas,
      ...(input.portada === undefined ? {} : { portada: input.portada }),
      ...(separadores.length > 0 ? { separadores } : {}),
      ...(orden.length > 0 ? { orden } : {}),
    };
    const id = randomUUID();
    await db.execute({
      sql: "INSERT INTO mk_generaciones (id, titulo, filtros, created_by) VALUES (?, ?, ?, ?)",
      args: [id, titulo, JSON.stringify(filtros), sesion.id],
    });
    after(() => ejecutarGeneracion(id));
    revalidatePath("/admin/marketing/catalogos");
    return { success: true, msg: "Generación iniciada", data: { id } };
  } catch (e) {
    console.error("[marketing] iniciarGeneracion falló:", e);
    return { success: false, msg: "No se pudo iniciar la generación" };
  }
}

export type EstadoGeneracion = {
  estado: "en_curso" | "listo" | "error";
  etapa: "erp" | "armando" | "guardando";
  mensaje: string | null;
  catalogoId: string | null;
  segundos: number;
};

/** Avance de una generación (la pantalla la consulta cada un par de segundos). */
export async function estadoGeneracion(id: string): Promise<ActionResult<EstadoGeneracion>> {
  const sesion = await sesionMarketing();
  if (!sesion) return { success: false, msg: "Sin permisos" };
  try {
    await cerrarGeneracionesAbandonadas();
    const r = await db.execute({
      sql: `SELECT estado, etapa, mensaje, catalogo_id,
                   EXTRACT(EPOCH FROM (COALESCE(finished_at, now_text())::timestamp - created_at::timestamp))::int AS segundos
            FROM mk_generaciones WHERE id = ?`,
      args: [id],
    });
    if (r.rows.length === 0) return { success: false, msg: "La generación no existe" };
    const f = r.rows[0];
    return {
      success: true,
      msg: "",
      data: {
        estado: f.estado as EstadoGeneracion["estado"],
        etapa: f.etapa as EstadoGeneracion["etapa"],
        mensaje: (f.mensaje as string | null) ?? null,
        catalogoId: (f.catalogo_id as string | null) ?? null,
        segundos: f.segundos as number,
      },
    };
  } catch (e) {
    console.error("[marketing] estadoGeneracion falló:", e);
    return { success: false, msg: "No se pudo consultar el avance" };
  }
}

/**
 * Guarda las páginas del editor en el BORRADOR: el de la versión que se está
 * editando (`version`) o, en un catálogo aún sin publicar, el inicial. Los
 * clientes no ven nada hasta que se publica.
 */
export async function guardarEdicion(
  id: string,
  version: number | null,
  entrada: { paginas: unknown; quitadas: unknown }
): Promise<ActionResult> {
  const sesion = await sesionMarketing();
  if (!sesion) return { success: false, msg: "Sin permisos" };

  try {
    let borrador: Borrador;
    if (version === null) {
      const c = await db.execute({ sql: "SELECT borrador FROM mk_catalogos WHERE id = ?", args: [id] });
      if (c.rows.length === 0) return { success: false, msg: "El catálogo no existe" };
      borrador = JSON.parse(c.rows[0].borrador as string) as Borrador;
    } else {
      const base = await borradorDeVersion(id, version);
      if (!base) return { success: false, msg: "La versión no existe" };
      borrador = base.borrador;
    }

    const plantillas = await db.execute("SELECT id FROM mk_plantillas");
    const ids = new Set(plantillas.rows.map((f) => f.id as string));

    // Se validan juntas para que los identificadores no se repitan entre páginas y quitadas.
    const paginasEnt = Array.isArray(entrada.paginas) ? entrada.paginas : null;
    const quitadasEnt = Array.isArray(entrada.quitadas) ? entrada.quitadas : null;
    if (!paginasEnt || !quitadasEnt) return { success: false, msg: "Formato inválido" };
    const todas = validarPaginas([...paginasEnt, ...quitadasEnt], borrador.productos.length, ids);
    if (typeof todas === "string") return { success: false, msg: todas };

    const paginas = todas.slice(0, paginasEnt.length);
    const quitadas = todas.slice(paginasEnt.length);
    const nuevo = JSON.stringify({ ...borrador, paginas, quitadas, resumen: { ...borrador.resumen, paginas: paginas.length } } satisfies Borrador);

    await db.batch([
      version === null
        ? { sql: "UPDATE mk_catalogos SET borrador = ?, updated_at = now_text() WHERE id = ?", args: [nuevo, id] }
        : { sql: "UPDATE mk_catalogo_versiones SET borrador = ? WHERE catalogo_id = ? AND version = ?", args: [nuevo, id, version] },
      ...(version === null ? [] : [{ sql: "UPDATE mk_catalogos SET updated_at = now_text() WHERE id = ?", args: [id] }]),
    ]);
    return { success: true, msg: "Guardado" };
  } catch (e) {
    console.error("[marketing] guardarEdicion falló:", e);
    return { success: false, msg: "No se pudo guardar" };
  }
}

/**
 * Publica una versión NUEVA a partir de la edición de `base` (la versión que se
 * abrió en el editor) o, si el catálogo nunca se publicó, de su borrador inicial.
 * El enlace de los clientes pasa a mostrar la versión nueva; las anteriores no se tocan.
 */
export async function publicarCatalogo(
  id: string,
  base: number | null = null
): Promise<ActionResult<{ version: number; enlaces: { principal: string; alterno: string } }>> {
  const sesion = await sesionMarketing();
  if (!sesion) return { success: false, msg: "Sin permisos" };

  try {
    const c = await db.execute({ sql: "SELECT slug, titulo, borrador FROM mk_catalogos WHERE id = ?", args: [id] });
    if (c.rows.length === 0) return { success: false, msg: "El catálogo no existe" };
    const { slug, titulo, borrador: crudo } = c.rows[0] as { slug: string; titulo: string; borrador: string };

    let partida: Borrador;
    if (base === null) {
      partida = JSON.parse(crudo) as Borrador;
    } else {
      const v = await borradorDeVersion(id, base);
      if (!v) return { success: false, msg: "La versión no existe" };
      partida = v.borrador;
    }
    // Imágenes reemplazadas desde que se generó el catálogo: se toma la versión vigente.
    const borrador = await sincronizarVersiones(partida);
    if (borrador.paginas.length === 0) return { success: false, msg: "El catálogo no tiene páginas" };

    const ids = [...new Set(borrador.paginas.flatMap((p) => (p.tipo === "producto" ? [p.plantilla] : [])))];
    const plantillas = await plantillasPorId(ids);
    const faltan = ids.filter((i) => !plantillas[i]);
    if (faltan.length > 0) return { success: false, msg: `Falta la plantilla ${faltan.join(", ")}` };

    const armado = armarSnapshot(titulo, borrador, plantillas, IMAGENES_BASE);
    // Enlaces sobre las páginas fijas (portada, redes…): salen de la biblioteca y de los enlaces de contacto vigentes.
    const [zonas, enlaces] = await Promise.all([zonasDeBiblioteca(), enlacesDeContacto()]);
    const datosSnapshot = { ...armado, paginas: conZonasClicables(armado.paginas, zonas, enlaces) };

    const v = await db.execute({
      sql: "SELECT COALESCE(MAX(version), 0) + 1 AS siguiente FROM mk_catalogo_versiones WHERE catalogo_id = ?",
      args: [id],
    });
    const version = v.rows[0].siguiente as number;

    // Imagen de la vista previa del enlace (WhatsApp…); si falla, se publica igual sin ella.
    const og = await generarImagenCompartir(datosSnapshot, slug, version);
    const snapshot = JSON.stringify(og ? { ...datosSnapshot, og } : datosSnapshot);

    await db.batch([
      {
        sql: `INSERT INTO mk_catalogo_versiones (catalogo_id, version, snapshot, paginas, publicado_por)
              VALUES (?, ?, ?, ?, ?)`,
        args: [id, version, snapshot, borrador.paginas.length, sesion.id],
      },
      // La edición de la versión de partida ya salió publicada: esa versión vuelve a verse tal como estaba.
      ...(base === null
        ? []
        : [{ sql: "UPDATE mk_catalogo_versiones SET borrador = NULL WHERE catalogo_id = ? AND version = ?", args: [id, base] }]),
      {
        // El borrador inicial solo sigue a la publicación mientras no hay versiones; después cada versión lleva el suyo.
        sql: `UPDATE mk_catalogos SET version_publicada = ?, updated_at = now_text()${base === null ? ", borrador = ?" : ""} WHERE id = ?`,
        args: base === null ? [version, JSON.stringify(borrador), id] : [version, id],
      },
    ]);

    // Que la próxima visita ya lea la versión nueva (no una copia en caché).
    updateTag(etiquetaCatalogo(slug));
    revalidatePath(`/admin/marketing/catalogos/${id}`);
    revalidatePath("/admin/marketing/catalogos");
    return { success: true, msg: `Versión ${version} publicada`, data: { version, enlaces: await enlacesCatalogo(slug) } };
  } catch (e) {
    console.error("[marketing] publicarCatalogo falló:", e);
    return { success: false, msg: e instanceof Error ? e.message : "No se pudo publicar" };
  }
}
