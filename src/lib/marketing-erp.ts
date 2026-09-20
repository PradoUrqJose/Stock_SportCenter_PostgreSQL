// Consulta del catálogo al ERP (SOLO servidor). Ejecuta api/catalogo.py, el
// mismo archivo que Vercel sirve como función: fuera de Vercel `next dev` no
// conoce api/*.py, así que se corre como script y se lee su JSON (igual que
// sincronizar.ts con api/sincronizar.py). Las credenciales ERP_USUARIO /
// ERP_CLAVE las toma del entorno o del .env.local.
import type { FiltrosCatalogo, ItemErp } from "./marketing-catalogo";

export async function consultarCatalogoErp(f: FiltrosCatalogo): Promise<ItemErp[]> {
  if (process.env.VERCEL) {
    // Pendiente del despliegue: llamar por HTTP a /api/catalogo con X-Sync-Secret
    // y con un límite de tiempo suficiente (el scrape de ~800 productos tarda ~30 s).
    throw new Error("La generación de catálogos todavía no está habilitada en producción.");
  }

  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { join } = await import("node:path");

  const filtros = {
    almacen: f.almacenes.join(","),
    // El ERP acepta varios valores separados por coma en cada filtro (comprobado con marca, grupo y género).
    grupo: f.grupos.join(","),
    marca: f.marcas.join(","),
    genero: f.generos.join(","),
    categoria: f.categorias.join(","),
  };
  const { stdout } = await promisify(execFile)(
    process.env.PYTHON_BIN ?? "python3",
    [join(process.cwd(), "api", "catalogo.py"), JSON.stringify(filtros)],
    // Un catálogo grande devuelve varios MB de JSON y el ERP responde lento.
    { maxBuffer: 128 * 1024 * 1024, timeout: 240_000 }
  );
  const json = JSON.parse(stdout) as { items?: ItemErp[] };
  return json.items ?? [];
}
