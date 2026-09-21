// Consulta del catálogo al ERP (SOLO servidor). El trabajo real lo hace api/catalogo.py:
//  - en Vercel se llama por HTTP a /api/catalogo (mismo proyecto), con el secreto compartido, igual que la sincronización;
//  - en tu Mac se ejecuta el mismo archivo como script y se lee su JSON (`next dev` no conoce api/*.py).
// Sin filtro de marca se pide TODO en una sola consulta (completa por construcción); solo si no cabe en el tiempo se reparte
// por marca y en paralelo, y entonces el catálogo lo avisa (ver `planificarConsultas`). El ERP tarda más que proporcional a
// las filas y las funciones de Vercel duran hasta 300 s (Hobby con Fluid Compute).
// Las credenciales ERP_USUARIO / ERP_CLAVE las toma del entorno o del .env.local.
import { db } from "@/lib/db";
import { planificarConsultas, valorMarcaErp, type ConsultaErp, type FiltrosCatalogo, type ItemErp } from "./marketing-catalogo";

/** Consultas simultáneas al ERP: probado con tres a la vez con el mismo usuario, sin cortar sesiones. */
const EN_PARALELO = 3;
/** Un poco menos que los 300 s de la función de Vercel, para responder con un error claro y no con un corte. */
const ESPERA_HTTP_MS = 290_000;

function urlCatalogoErp(): string | null {
  if (process.env.ERP_CATALOGO_URL) return process.env.ERP_CATALOGO_URL; // pruebas locales de la ruta HTTP
  if (!process.env.VERCEL) return null;
  // VERCEL_URL es la URL de ESTE despliegue y Vercel la protege con su login; el dominio de producción no.
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return `https://${host}/api/catalogo`;
}

/** Lo que sabe el sistema (STOCK) para repartir la consulta: productos con stock por marca y género, y todas las marcas y géneros que conoce. */
async function conocerLocal(f: FiltrosCatalogo) {
  const condiciones = ["stock_total > 0", "marca IS NOT NULL"];
  const args: unknown[] = [];
  for (const [columna, valores] of [["categoria", f.categorias], ["grupo", f.grupos], ["genero", f.generos], ["marca", f.marcas]] as const) {
    if (valores.length > 0) {
      condiciones.push(`${columna} = ANY(?)`);
      args.push(valores);
    }
  }
  const [conteos, marcas, generos] = await Promise.all([
    db.execute({ sql: `SELECT marca, genero, COUNT(*)::int AS n FROM productos WHERE ${condiciones.join(" AND ")} GROUP BY 1, 2`, args: args as never[] }),
    db.execute("SELECT DISTINCT marca FROM productos WHERE marca IS NOT NULL AND marca <> ''"),
    db.execute("SELECT DISTINCT genero FROM productos WHERE genero IS NOT NULL AND genero <> ''"),
  ]);
  return {
    conteos: conteos.rows.map((x) => ({ marca: x.marca as string, genero: x.genero as string, n: x.n as number })),
    universoMarcas: marcas.rows.map((x) => x.marca as string),
    universoGeneros: generos.rows.map((x) => x.genero as string),
  };
}

async function pedirAlErp(f: FiltrosCatalogo, c: ConsultaErp): Promise<ItemErp[]> {
  // El ERP acepta varios valores separados por coma en cada filtro (comprobado con marca, grupo, género y categoría).
  const filtros = {
    almacen: f.almacenes.join(","),
    grupo: f.grupos.join(","),
    // El filtro de marca del ERP pide el nombre sin espacios («NEW BALANCE» → «NEWBALANCE»); con espacio no devuelve nada.
    marca: c.marcas.map(valorMarcaErp).join(","),
    genero: c.generos.join(","),
    categoria: f.categorias.join(","),
  };

  const url = urlCatalogoErp();
  if (url) {
    const secreto = process.env.SYNC_SECRET;
    if (!secreto) throw new Error("Falta SYNC_SECRET en las variables de entorno.");
    const res = await fetch(url, {
      method: "POST",
      headers: { "X-Sync-Secret": secreto, "Content-Type": "application/json" },
      body: JSON.stringify(filtros),
      cache: "no-store",
      signal: AbortSignal.timeout(ESPERA_HTTP_MS),
    }).catch((e: unknown) => {
      throw new Error(e instanceof Error && e.name === "TimeoutError" ? "El ERP tardó demasiado en responder; vuelve a intentarlo" : "No se pudo llamar al ERP");
    });
    const cuerpo = (await res.json().catch(() => ({}))) as { items?: ItemErp[]; error?: string };
    if (!res.ok) throw new Error(cuerpo.error ?? `El ERP respondió ${res.status}`);
    return cuerpo.items ?? [];
  }

  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { join } = await import("node:path");
  const { stdout } = await promisify(execFile)(
    process.env.PYTHON_BIN ?? "python3",
    [join(process.cwd(), "api", "catalogo.py"), JSON.stringify(filtros)],
    { maxBuffer: 128 * 1024 * 1024, timeout: 290_000 }
  );
  return (JSON.parse(stdout) as { items?: ItemErp[] }).items ?? [];
}

export async function consultarCatalogoErp(f: FiltrosCatalogo): Promise<{ items: ItemErp[]; parcial: boolean }> {
  // Los conteos del sistema solo sirven para estimar el tiempo y, si hace falta, repartir el trabajo.
  const local = await conocerLocal(f);
  const plan = planificarConsultas(local.conteos, { generosFiltro: f.generos, universoMarcas: local.universoMarcas, universoGeneros: local.universoGeneros, marcasPedidas: f.marcas });
  const trabajos: ConsultaErp[] = plan.consultas;

  const resultados: ItemErp[][] = new Array(trabajos.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < trabajos.length) {
      const i = siguiente++;
      resultados[i] = await pedirAlErp(f, trabajos[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(EN_PARALELO, trabajos.length) }, trabajador));
  return { items: resultados.flat(), parcial: plan.parcial };
}
