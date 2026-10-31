// Transporte único para todos los filtros: el ERP aporta sus códigos; STOCK solo estima los volúmenes.
import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";
import type { FiltrosCatalogo, ItemErp } from "./marketing-catalogo";
import { opcionesErp, ordenEjecucionErp, planificarConsultas, prepararConteosErp, type ConteoErp } from "./marketing-erp-plan";
import { ejecutarLotesErp, PLAZO_ERP_MS, respuestaErp, validarIntegridadErp } from "./marketing-erp-control";

function urlCatalogoErp(origen?: string): string | null {
  if (process.env.ERP_CATALOGO_URL) return process.env.ERP_CATALOGO_URL;
  if (!process.env.VERCEL) return null;
  const host = origen && origen !== process.env.CATALOGOS_HOST ? origen : (process.env.VERCEL_URL ?? origen);
  return `https://${host}/api/catalogo`;
}

async function conocerLocal(): Promise<ConteoErp[]> {
  // Fecha, stock mínimo y almacenes pueden reducir el resultado: los conteos son una orientación superior,
  // nunca una prueba de que en el ERP no existen otros productos u opciones.
  const r = await db.execute(`SELECT COALESCE(marca, '') AS marca, COALESCE(genero, '') AS genero,
    COALESCE(grupo, '') AS grupo, COALESCE(categoria, '') AS categoria, COUNT(*)::int AS n
    FROM productos WHERE stock_total > 0 GROUP BY 1, 2, 3, 4`);
  return r.rows as ConteoErp[];
}

async function llamarErp(filtros: object, signal: AbortSignal, origen?: string): Promise<unknown> {
  const url = urlCatalogoErp(origen);
  if (url) {
    const secreto = process.env.SYNC_SECRET;
    if (!secreto) throw new Error("Falta SYNC_SECRET en las variables de entorno");
    const res = await fetch(url, {
      method: "POST", headers: { "X-Sync-Secret": secreto, "Content-Type": "application/json" },
      body: JSON.stringify(filtros), cache: "no-store", signal,
    });
    const cuerpo: unknown = await res.json().catch(() => { throw new Error("El ERP devolvió una respuesta que no es JSON; se canceló la consulta"); });
    if (!res.ok) {
      const mensaje = cuerpo && typeof cuerpo === "object" && "error" in cuerpo ? String(cuerpo.error) : `El ERP respondió ${res.status}`;
      throw new Error(mensaje);
    }
    return cuerpo;
  }
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { join } = await import("node:path");
  let stdout: string;
  try {
    ({ stdout } = await promisify(execFile)(process.env.PYTHON_BIN ?? "python3", [join(process.cwd(), "api", "catalogo.py"), JSON.stringify(filtros)], { maxBuffer: 128 * 1024 * 1024, timeout: PLAZO_ERP_MS, signal }));
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    const detalle = error as { stderr?: string };
    if (/ReadTimeout|read timeout|TimeoutError/.test(detalle.stderr ?? "")) throw new Error("El ERP agotó el tiempo de respuesta; vuelve a intentarlo o reduce la selección");
    throw new Error("No se pudo obtener una respuesta válida del ERP; no se modificó el catálogo");
  }
  let cuerpo: unknown;
  try { cuerpo = JSON.parse(stdout); }
  catch { throw new Error("El ERP devolvió una respuesta que no es JSON; se canceló la consulta"); }
  if (cuerpo && typeof cuerpo === "object" && "error" in cuerpo && typeof cuerpo.error === "string") throw new Error(cuerpo.error);
  return cuerpo;
}

export async function consultarCatalogoErp(f: FiltrosCatalogo, origen?: string): Promise<{ items: ItemErp[]; parcial: boolean }> {
  const consultaId = randomUUID();
  const inicio = performance.now();
  const [conteos, datosOpciones] = await Promise.all([conocerLocal(), llamarErp({ operacion: "opciones" }, AbortSignal.timeout(35_000), origen)]);
  const opciones = opcionesErp(datosOpciones);
  const plan = planificarConsultas(conteos, f, opciones);
  const orden = ordenEjecucionErp(prepararConteosErp(conteos, opciones), plan.consultas);
  console.info("[marketing:erp]", JSON.stringify({ consultaId, evento: "inicio", lotes: plan.consultas.length, paralelo: Math.min(3, plan.consultas.length), parcial: false, estimadas: plan.estimadas, plan_ms: Math.round(performance.now() - inicio) }));
  const resultados = await ejecutarLotesErp(orden, async (i, signal) => {
    const c = plan.consultas[i];
    const inicioLote = performance.now();
    try {
      const respuesta = respuestaErp(await llamarErp({
        almacen: f.almacenes.join(","), grupo: c.grupos.join(","), marca: c.marcas.join(","), genero: c.generos.join(","), categoria: c.categorias.join(","),
        fecha_minima_ingreso: f.fecha_minima_ingreso ? f.fecha_minima_ingreso.split("-").reverse().join("/") : "", stock_mayor_a: String(f.stock_minimo ?? 1),
      }, signal, origen));
      console.info("[marketing:erp]", JSON.stringify({ consultaId, evento: "lote", lote: i + 1, filas: respuesta.items.length, total_ms: Math.round(performance.now() - inicioLote), tiempos: respuesta.tiempos }));
      return respuesta.items;
    } catch (error) {
      console.error("[marketing:erp]", JSON.stringify({ consultaId, evento: "error", lote: i + 1, total_ms: Math.round(performance.now() - inicioLote) }));
      throw error;
    }
  }, { plazoMs: Math.max(1, PLAZO_ERP_MS - (performance.now() - inicio)) });
  const items = resultados.flat();
  try { validarIntegridadErp(items); }
  catch (error) {
    console.error("[marketing:erp]", JSON.stringify({ consultaId, evento: "integridad_invalida", filas: items.length, total_ms: Math.round(performance.now() - inicio) }));
    throw error;
  }
  console.info("[marketing:erp]", JSON.stringify({ consultaId, evento: "fin", filas: items.length, total_ms: Math.round(performance.now() - inicio) }));
  return { items, parcial: false };
}
