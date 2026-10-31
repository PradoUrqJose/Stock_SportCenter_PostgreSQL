// Control común de las consultas: sin Next, BD ni red para poder probar fallos y plazos.
import type { ItemErp } from "./marketing-catalogo";

export const PLAZO_ERP_MS = 240_000;
export const ESPERA_PRECARGA_MS = 260_000;

export type RespuestaErp = { items: ItemErp[]; tiempos?: Record<string, number> };

export function respuestaErp(val: unknown): RespuestaErp {
  if (!val || typeof val !== "object" || Array.isArray(val)) throw new Error("El ERP devolvió una respuesta inválida; no se modificó el catálogo");
  const cuerpo = val as Record<string, unknown>;
  if (typeof cuerpo.error === "string" && cuerpo.error) throw new Error(cuerpo.error);
  if (!Array.isArray(cuerpo.items) || cuerpo.items.some((item) =>
    !item || typeof item !== "object" || typeof item.cod_universal !== "string" || !item.cod_universal.trim() ||
    !item.tallas || typeof item.tallas !== "object" || Array.isArray(item.tallas)
  )) throw new Error("El ERP devolvió datos incompletos; no se modificó el catálogo");
  return cuerpo as RespuestaErp;
}

/** El exportador no aporta una identidad interna que permita sumar o descartar fichas repetidas con certeza. */
export function validarIntegridadErp(items: readonly ItemErp[]): void {
  const vistos = new Set<string>();
  const repetidos = new Set<string>();
  for (const item of items) {
    const clave = `${item.cod_universal?.trim().toUpperCase()} · ${item.genero?.trim().toUpperCase() ?? "SIN GÉNERO"}`;
    if (vistos.has(clave)) repetidos.add(clave);
    vistos.add(clave);
    const cantidades = Object.values(item.tallas).map((n) => typeof n === "number" ? n : Number.NaN);
    const stock = item.stock_total == null || item.stock_total === "" ? Number.NaN : Number(item.stock_total);
    if (!Number.isFinite(stock) || cantidades.some((n) => !Number.isFinite(n)) || Math.abs(cantidades.reduce((a, n) => a + n, 0) - stock) > 0.000001) {
      throw new Error(`El stock por talla no coincide con el total del ERP para ${clave}; se canceló la operación`);
    }
  }
  if (repetidos.size) throw new Error(`El ERP tiene fichas repetidas para ${repetidos.size} códigos y géneros: ${[...repetidos].slice(0, 10).join(", ")}${repetidos.size > 10 ? ", y otros más" : ""}. Revisa esas fichas en el ERP; no se modificó el catálogo`);
}

/** Al fallar un lote se cancelan los demás y no se inicia ningún trabajo pendiente. */
export async function ejecutarLotesErp<T>(
  orden: readonly number[],
  pedir: (indice: number, signal: AbortSignal) => Promise<T>,
  opciones: { paralelo?: number; plazoMs?: number } = {},
): Promise<T[]> {
  const paralelo = opciones.paralelo ?? 3;
  if (!Number.isInteger(paralelo) || paralelo < 1 || new Set(orden).size !== orden.length || orden.some((i) => !Number.isInteger(i) || i < 0 || i >= orden.length)) throw new Error("Plan de ejecución del ERP inválido");
  const control = new AbortController();
  const resultados: T[] = new Array(orden.length);
  let siguiente = 0;
  let fallo: unknown;
  const cancelar = (error: unknown) => {
    if (control.signal.aborted) return;
    fallo = error;
    control.abort(error);
  };
  const temporizador = setTimeout(() => cancelar(new Error("El ERP superó el tiempo disponible; vuelve a intentarlo con una selección menor")), opciones.plazoMs ?? PLAZO_ERP_MS);
  try {
    const trabajador = async () => {
      while (!control.signal.aborted && siguiente < orden.length) {
        const i = orden[siguiente++];
        try {
          resultados[i] = await pedir(i, control.signal);
        } catch (error) {
          cancelar(error);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(paralelo, orden.length) }, trabajador));
    if (control.signal.aborted) throw fallo;
    return resultados;
  } finally {
    clearTimeout(temporizador);
  }
}

/** Una precarga pendiente o fallida nunca da permiso para lanzar otra consulta de forma implícita. */
export async function esperarPrecarga<T>(
  leer: () => Promise<{ estado: string; resultado: string | null; mensaje?: string | null } | null>,
  parsear: (json: string) => T,
  opciones: { ahora?: () => number; dormir?: () => Promise<void>; plazoMs?: number } = {},
): Promise<T | null> {
  const ahora = opciones.ahora ?? (() => performance.now());
  const limite = ahora() + (opciones.plazoMs ?? ESPERA_PRECARGA_MS);
  let observada = false;
  for (;;) {
    const fila = await leer();
    if (!fila) {
      if (observada) throw new Error("La consulta previa al ERP dejó de estar disponible; vuelve a intentarlo");
      return null;
    }
    observada = true;
    if (fila.estado === "listo") {
      if (!fila.resultado) throw new Error("La consulta previa del ERP no guardó datos; vuelve a intentarlo");
      return parsear(fila.resultado);
    }
    if (fila.estado === "error") throw new Error(fila.mensaje || "La consulta previa al ERP falló; vuelve a intentar la generación");
    if (ahora() >= limite) throw new Error("La consulta previa al ERP sigue pendiente; vuelve a intentarlo cuando termine");
    await (opciones.dormir?.() ?? new Promise((resolve) => setTimeout(resolve, 1000)));
  }
}
