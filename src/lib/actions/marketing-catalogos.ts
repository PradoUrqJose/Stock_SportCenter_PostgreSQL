"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { after } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { IMAGENES_BASE, enlacesCatalogo, sesionMarketing } from "@/lib/marketing";
import { borradorDeVersion, enlacesDeContacto, plantillasPorId, sincronizarVersiones, zonasDeBiblioteca } from "@/lib/marketing-catalogos-datos";
import { borradorBase, cerrarGeneracionesAbandonadas, ejecutarGeneracion, ejecutarSincronizacion } from "@/lib/marketing-generacion";
import { sincronizarBorrador, type InformeSincronizacion } from "@/lib/marketing-sincronizar";
import { indiceDeTallas } from "@/lib/marketing-tallas-datos";
import { convertirProductos } from "@/lib/marketing-tallas";
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
  escalaDe,
  normalizarFiltros,
  type Borrador,
  type FiltrosCatalogo,
} from "@/lib/marketing-catalogo";
import type { ActionResult } from "@/types";

type EntradaFiltros = {
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
  /** Escala de las tallas que se muestran: «peru» o «usa». */
  escala_talla?: "peru" | "usa";
};

/** Valida los filtros que llegan del navegador (nunca se confía en ellos) y los deja en su forma guardada. */
async function filtrosDeEntrada(input: EntradaFiltros): Promise<{ filtros: FiltrosCatalogo } | { error: string }> {
  const almacenes = valoresFiltro(input.almacenes)?.filter((a): a is (typeof ALMACENES)[number] => (ALMACENES as readonly string[]).includes(a));
  const grupos = valoresFiltro(input.grupos);
  const marcas = valoresFiltro(input.marcas);
  const generos = valoresFiltro(input.generos);
  const categorias = valoresFiltro(input.categorias);
  if (!almacenes || almacenes.length === 0) return { error: "Elige al menos un almacén" };
  if (!grupos || !marcas || !generos || !categorias) return { error: "Filtro con caracteres no válidos" };

  const tallas = valoresTalla(input.tallas ?? []);
  if (!tallas) return { error: "Talla con caracteres no válidos" };

  const precio_min = precioFiltro(input.precio_min);
  const precio_max = precioFiltro(input.precio_max);
  if (precio_min === undefined || precio_max === undefined) return { error: "El precio debe ser un número válido" };
  if (precio_min != null && precio_max != null && precio_min > precio_max) return { error: "El precio mínimo no puede ser mayor que el máximo" };
  const tipo = (await idsDeTipos()).has(input.tipo) ? input.tipo : "";

  // Plantillas elegidas por marca: solo se aceptan pares con formato de marca e id (el resto lo valida la generación).
  const plantillas: Record<string, string> = {};
  for (const [marca, pid] of Object.entries(input.plantillas ?? {}).slice(0, 60)) {
    if (/^[A-Z0-9 &.*-]{1,40}$/.test(marca) && /^[a-z0-9-]{1,80}$/.test(String(pid))) plantillas[marca] = String(pid);
  }

  // Sin ningún filtro se traería todo el ERP (miles de filas): se evita por error.
  if (grupos.length + marcas.length + generos.length + categorias.length === 0) {
    return { error: "Elige un tipo de catálogo o al menos una marca, un grupo, un género o una categoría" };
  }
  const escala_talla = input.escala_talla === "peru" || input.escala_talla === "usa" ? input.escala_talla : undefined;
  return { filtros: { tipo, almacenes, grupos, marcas, generos, categorias, tallas, precio_min, precio_max, plantillas, ...(escala_talla ? { escala_talla } : {}) } };
}

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
  /** Escala de las tallas que se muestran: «peru» (por defecto) o «usa». */
  escala_talla?: "peru" | "usa";
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

  const base = await filtrosDeEntrada(input);
  if ("error" in base) return { success: false, msg: base.error };
  const { tipo, almacenes, grupos, marcas, generos, categorias, tallas, precio_min, precio_max, plantillas } = base.filtros;
  // Los catálogos nuevos salen con la talla peruana salvo que se pida la USA.
  const escala_talla = base.filtros.escala_talla ?? "peru";

  // Portada y separadores: ids de páginas fijas (la generación ignora los que no existan o no sean del tipo).
  const ID_FIJA = /^[a-z0-9-]{1,60}$/;
  if (input.portada != null && !ID_FIJA.test(String(input.portada))) return { success: false, msg: "Portada no válida" };
  const separadores = (Array.isArray(input.separadores) ? input.separadores : []).filter((x) => ID_FIJA.test(String(x))).slice(0, 20).map(String);

  const orden = Array.isArray(input.orden) ? [...new Set(input.orden.map(String))].filter((x) => ID_FIJA.test(x) || x === CLAVE_PRODUCTOS || /^productos:[\p{L}\p{N} &.'*-]{1,40}$/u.test(x)).slice(0, 60) : [];

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
      escala_talla,
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
  /** «sincronizar» = actualiza un catálogo existente; su avance termina en la pantalla de revisión. */
  modo: "nuevo" | "sincronizar";
  baseVersion: number | null;
};

/** Avance de una generación (la pantalla la consulta cada un par de segundos). */
export async function estadoGeneracion(id: string): Promise<ActionResult<EstadoGeneracion>> {
  const sesion = await sesionMarketing();
  if (!sesion) return { success: false, msg: "Sin permisos" };
  try {
    await cerrarGeneracionesAbandonadas();
    const r = await db.execute({
      sql: `SELECT estado, etapa, mensaje, catalogo_id, modo, base_version,
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
        modo: (f.modo as EstadoGeneracion["modo"]) ?? "nuevo",
        baseVersion: (f.base_version as number | null) ?? null,
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

    // El motivo «sync» solo tiene sentido en las quitadas: una página restaurada ya no lo lleva.
    const paginas = todas.slice(0, paginasEnt.length).map((p) => {
      if (p.tipo !== "producto" || !p.motivo) return p;
      const activa = { ...p };
      delete activa.motivo;
      return activa;
    });
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
): Promise<ActionResult<{ version: number; sinImagen: number; conTallaUsa: number; enlaces: { principal: string; alterno: string } }>> {
  const sesion = await sesionMarketing();
  if (!sesion) return { success: false, msg: "Sin permisos" };

  try {
    const c = await db.execute({ sql: "SELECT slug, titulo, borrador, created_at, filtros FROM mk_catalogos WHERE id = ?", args: [id] });
    if (c.rows.length === 0) return { success: false, msg: "El catálogo no existe" };
    const { slug, titulo, borrador: crudo, created_at, filtros: filtrosCrudos } = c.rows[0] as { slug: string; titulo: string; borrador: string; created_at: string; filtros: string };

    let partida: Borrador;
    if (base === null) {
      partida = JSON.parse(crudo) as Borrador;
    } else {
      const v = await borradorDeVersion(id, base);
      if (!v) return { success: false, msg: "La versión no existe" };
      partida = v.borrador;
    }
    // Imágenes reemplazadas desde que se generó el catálogo: se toma la versión vigente.
    // Los datos de stock y precio son los del último momento en que se consultó el ERP: al generar o al sincronizar.
    // Un catálogo generado antes de que se registrara esa fecha la toma de cuando se generó (nunca se ha vuelto a consultar).
    const creado = new Date(`${created_at.replace(" ", "T").slice(0, 19)}Z`);
    const stockAl = partida.stock_al ?? (Number.isNaN(creado.getTime()) ? undefined : creado.toISOString());
    const borrador = { ...(await sincronizarVersiones(partida)), ...(stockAl ? { stock_al: stockAl } : {}) };
    if (borrador.paginas.length === 0) return { success: false, msg: "El catálogo no tiene páginas" };

    const ids = [...new Set(borrador.paginas.flatMap((p) => (p.tipo === "producto" ? [p.plantilla] : [])))];
    const plantillas = await plantillasPorId(ids);
    const faltan = ids.filter((i) => !plantillas[i]);
    if (faltan.length > 0) return { success: false, msg: `Falta la plantilla ${faltan.join(", ")}` };

    // Las tallas que ven los clientes: en la escala del catálogo (peruana con la equivalencia de cada marca y género). El borrador
    // se guarda siempre con la talla USA del ERP; solo el snapshot publicado lleva las tallas ya convertidas.
    const escala = escalaDe(normalizarFiltros(JSON.parse(filtrosCrudos)));
    const usados = [...new Set(borrador.paginas.flatMap((p) => (p.tipo === "producto" ? [p.prod] : [])))].map((i) => borrador.productos[i]);
    const idxTallas = await indiceDeTallas();
    const convertidos = convertirProductos(borrador.productos, idxTallas, escala);
    const conTallaUsa = escala === "peru" ? convertirProductos(usados, idxTallas, "peru").avisos.reduce((a, x) => a + x.productos, 0) : 0;
    const armado = armarSnapshot(titulo, { ...borrador, productos: convertidos.productos }, plantillas, IMAGENES_BASE);
    // Enlaces sobre las páginas fijas (portada, redes…): salen de la biblioteca y de los enlaces de contacto vigentes.
    const [zonas, enlaces] = await Promise.all([zonasDeBiblioteca(), enlacesDeContacto()]);
    const datosSnapshot = { ...armado, ...(escala === "peru" ? { escala_talla: "peru" as const } : {}), paginas: conZonasClicables(armado.paginas, zonas, enlaces) };

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
    // Productos que salen sin imagen (su zapatilla queda vacía para los clientes): se avisa al publicar.
    const sinImagen = new Set(borrador.paginas.flatMap((p) => (p.tipo === "producto" && borrador.productos[p.prod]?.v === 0 ? [borrador.productos[p.prod].cod] : []))).size;
    return {
      success: true,
      msg: `Versión ${version} publicada${sinImagen > 0 ? `; ${sinImagen} producto${sinImagen === 1 ? "" : "s"} sin imagen` : ""}${conTallaUsa > 0 ? `; ${conTallaUsa} con talla USA (falta la equivalencia)` : ""}`,
      data: { version, sinImagen, conTallaUsa, enlaces: await enlacesCatalogo(slug) },
    };
  } catch (e) {
    console.error("[marketing] publicarCatalogo falló:", e);
    return { success: false, msg: e instanceof Error ? e.message : "No se pudo publicar" };
  }
}

/**
 * Pide sincronizar un catálogo con el ERP y responde al instante: la consulta corre en segundo plano y la pantalla la
 * sigue con `estadoGeneracion`. Los filtros pueden ser otros que los del catálogo (se editan como en el asistente).
 * No cambia nada del catálogo: el resultado se revisa y se aplica con `aplicarSincronizacion`.
 * @param input.version versión cuyo borrador se actualiza; null = el borrador de un catálogo que aún no se publicó
 */
export async function iniciarSincronizacion(input: EntradaFiltros & { catalogoId: string; version: number | null }): Promise<ActionResult<{ id: string }>> {
  const sesion = await sesionMarketing();
  if (!sesion) return { success: false, msg: "Sin permisos" };

  const base = await filtrosDeEntrada(input);
  if ("error" in base) return { success: false, msg: base.error };
  if (!(await rateLimit(`mk-generar:${sesion.id}`, 6, 60_000))) {
    return { success: false, msg: "Demasiadas consultas seguidas; espera un minuto" };
  }

  try {
    const c = await db.execute({ sql: "SELECT titulo FROM mk_catalogos WHERE id = ?", args: [String(input.catalogoId)] });
    if (c.rows.length === 0) return { success: false, msg: "El catálogo no existe" };
    const version = input.version === null || input.version === undefined ? null : Number(input.version);
    const versiones = await db.execute({ sql: "SELECT version FROM mk_catalogo_versiones WHERE catalogo_id = ?", args: [input.catalogoId] });
    if (version === null ? versiones.rows.length > 0 : !versiones.rows.some((f) => f.version === version)) {
      return { success: false, msg: "La versión que se quiere sincronizar no existe" };
    }

    // Una a la vez: cada una consulta el ERP.
    await cerrarGeneracionesAbandonadas();
    const activa = await db.execute("SELECT id, titulo FROM mk_generaciones WHERE estado = 'en_curso' LIMIT 1");
    if (activa.rows.length > 0) {
      return { success: false, msg: `Ya hay una consulta al ERP en curso («${activa.rows[0].titulo}»); espera a que termine` };
    }

    const id = randomUUID();
    await db.execute({
      sql: `INSERT INTO mk_generaciones (id, titulo, filtros, created_by, modo, base_catalogo_id, base_version)
            VALUES (?, ?, ?, ?, 'sincronizar', ?, ?)`,
      args: [id, c.rows[0].titulo as string, JSON.stringify(base.filtros), sesion.id, input.catalogoId, version],
    });
    after(() => ejecutarSincronizacion(id));
    return { success: true, msg: "Consultando el ERP", data: { id } };
  } catch (e) {
    console.error("[marketing] iniciarSincronizacion falló:", e);
    return { success: false, msg: "No se pudo iniciar la sincronización" };
  }
}

/**
 * Aplica una sincronización revisada al borrador de la versión que se sincroniza: tallas y precios al día, productos
 * nuevos agregados y los que ya no tienen stock quitados (a «Quitadas»). Se calcula sobre el borrador de AHORA, no
 * sobre el de cuando se consultó el ERP, así no se pierde lo que Marketing editó mientras tanto. Los filtros del
 * catálogo pasan a ser los de la sincronización. Las versiones publicadas no se tocan: los clientes ven lo nuevo
 * cuando se publica una versión nueva.
 */
export async function aplicarSincronizacion(generacionId: string): Promise<ActionResult<{ catalogoId: string; version: number | null; informe: InformeSincronizacion }>> {
  const sesion = await sesionMarketing();
  if (!sesion) return { success: false, msg: "Sin permisos" };

  try {
    const g = await db.execute({
      sql: `SELECT estado, modo, base_catalogo_id, base_version, filtros, resultado, aplicada_at FROM mk_generaciones WHERE id = ?`,
      args: [generacionId],
    });
    if (g.rows.length === 0) return { success: false, msg: "La sincronización no existe" };
    const f = g.rows[0] as { estado: string; modo: string; base_catalogo_id: string | null; base_version: number | null; filtros: string; resultado: string | null; aplicada_at: string | null };
    if (f.modo !== "sincronizar" || f.estado !== "listo" || !f.resultado || !f.base_catalogo_id) return { success: false, msg: "Esta sincronización no está lista para aplicarse" };
    if (f.aplicada_at) return { success: false, msg: "Esta sincronización ya se aplicó" };

    const catalogoId = f.base_catalogo_id;
    const actual = await borradorBase(catalogoId, f.base_version);
    if (!actual) return { success: false, msg: "La versión que se sincroniza ya no existe" };
    const { al, fresco } = JSON.parse(f.resultado) as { al: string; fresco: Borrador };
    const { borrador, informe } = sincronizarBorrador(actual, fresco, al);
    if (borrador.paginas.every((p) => p.tipo !== "producto")) return { success: false, msg: "La sincronización dejaría el catálogo sin productos; no se aplicó" };

    // Los filtros del catálogo pasan a ser los de la sincronización (lo demás —portada, separadores, orden— se conserva).
    const c = await db.execute({ sql: "SELECT filtros FROM mk_catalogos WHERE id = ?", args: [catalogoId] });
    const nuevosFiltros: FiltrosCatalogo = { ...normalizarFiltros(JSON.parse(c.rows[0].filtros as string)), ...normalizarFiltros(JSON.parse(f.filtros)) };

    const texto = JSON.stringify(borrador);
    await db.batch([
      f.base_version === null
        ? { sql: "UPDATE mk_catalogos SET borrador = ?, filtros = ?, updated_at = now_text() WHERE id = ?", args: [texto, JSON.stringify(nuevosFiltros), catalogoId] }
        : { sql: "UPDATE mk_catalogo_versiones SET borrador = ? WHERE catalogo_id = ? AND version = ?", args: [texto, catalogoId, f.base_version] },
      ...(f.base_version === null ? [] : [{ sql: "UPDATE mk_catalogos SET filtros = ?, updated_at = now_text() WHERE id = ?", args: [JSON.stringify(nuevosFiltros), catalogoId] }]),
      { sql: "UPDATE mk_generaciones SET aplicada_at = now_text() WHERE id = ?", args: [generacionId] },
    ]);
    revalidatePath(`/admin/marketing/catalogos/${catalogoId}`);
    revalidatePath("/admin/marketing/catalogos");
    return { success: true, msg: "Sincronización aplicada", data: { catalogoId, version: f.base_version, informe } };
  } catch (e) {
    console.error("[marketing] aplicarSincronizacion falló:", e);
    return { success: false, msg: "No se pudo aplicar la sincronización" };
  }
}

/** Cambia la escala de tallas de un catálogo (peruana o USA): rige el editor y lo que se publique desde ahora; las versiones ya publicadas no cambian. */
export async function cambiarEscalaTalla(id: string, escala: "peru" | "usa"): Promise<ActionResult> {
  if (!(await sesionMarketing())) return { success: false, msg: "Sin permisos" };
  if (escala !== "peru" && escala !== "usa") return { success: false, msg: "Escala no válida" };
  try {
    const c = await db.execute({ sql: "SELECT filtros FROM mk_catalogos WHERE id = ?", args: [id] });
    if (c.rows.length === 0) return { success: false, msg: "El catálogo no existe" };
    const filtros: FiltrosCatalogo = { ...normalizarFiltros(JSON.parse(c.rows[0].filtros as string)), escala_talla: escala };
    await db.execute({ sql: "UPDATE mk_catalogos SET filtros = ?, updated_at = now_text() WHERE id = ?", args: [JSON.stringify(filtros), id] });
    revalidatePath(`/admin/marketing/catalogos/${id}`);
    return { success: true, msg: escala === "peru" ? "Tallas peruanas" : "Tallas USA" };
  } catch (e) {
    console.error("[marketing] cambiarEscalaTalla falló:", e);
    return { success: false, msg: "No se pudo cambiar la escala de tallas" };
  }
}
