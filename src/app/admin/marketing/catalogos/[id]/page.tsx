import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ChevronLeft, RefreshCw } from "lucide-react";
import { db } from "@/lib/db";
import { enlacesCatalogo, requireMarketing } from "@/lib/marketing";
import { fechaLima, normalizarFiltros, textoFiltros, type Borrador } from "@/lib/marketing-catalogo";
import { tiposCatalogo } from "@/lib/marketing-tipos";
import { EliminarCatalogo, EnlaceCatalogo, PublicarCatalogo } from "@/components/admin/marketing/acciones-catalogo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Catalogo = {
  id: string;
  slug: string;
  titulo: string;
  filtros: string;
  borrador: string;
  version_publicada: number | null;
  created_at: string;
};
type Version = { version: number; paginas: number; publicado_at: string; nombre: string | null; con_cambios: boolean; sin_imagen: number };

function Dato({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

export default async function CatalogoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  await requireMarketing();
  const { id } = await params;

  const c = await db.execute({
    sql: "SELECT id, slug, titulo, filtros, borrador, version_publicada, created_at FROM mk_catalogos WHERE id = ?",
    args: [id],
  });
  if (c.rows.length === 0) notFound();
  const cat = c.rows[0] as unknown as Catalogo;
  const borrador = JSON.parse(cat.borrador) as Borrador;
  const filtros = normalizarFiltros(JSON.parse(cat.filtros));
  const r = borrador.resumen;

  const v = await db.execute({
    // `sin_imagen`: productos de esa versión publicada cuya imagen faltaba (versión de imagen 0): su zapatilla sale vacía.
    sql: `SELECT v.version, v.paginas, v.publicado_at, u.nombre, (v.borrador IS NOT NULL) AS con_cambios,
                 (SELECT COUNT(DISTINCT e->>'cod')::int FROM jsonb_array_elements(v.snapshot::jsonb->'productos') e WHERE (e->>'v')::int = 0) AS sin_imagen
          FROM mk_catalogo_versiones v LEFT JOIN users u ON u.id = v.publicado_por
          WHERE v.catalogo_id = ? ORDER BY v.version DESC`,
    args: [id],
  });
  const versiones = v.rows as unknown as Version[];
  const vigente = versiones.find((x) => x.version === cat.version_publicada);
  const paginasVigentes = vigente?.paginas ?? r.paginas;
  // Por agregar imagen: lo que tiene la versión vigente hoy (no lo que había al generar: desde entonces se pudieron subir).
  const porAgregarImagen = vigente ? vigente.sin_imagen : r.sin_imagen.length;
  const enlaces = cat.version_publicada ? await enlacesCatalogo(cat.slug) : null;

  const filtrosTexto = textoFiltros(filtros, await tiposCatalogo());

  return (
    <div className="p-4 md:p-8">
      <Link href="/admin/marketing/catalogos" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" /> Catálogos
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{cat.titulo}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{filtrosTexto.join(" · ")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/marketing/catalogos/${cat.id}/sincronizar`}
            className={cn(buttonVariants({ variant: "outline" }))}
            title="Actualiza las tallas y los precios con el ERP, agrega productos nuevos y quita los que ya no tienen stock"
          >
            <RefreshCw data-icon="inline-start" /> Sincronizar con el ERP
          </Link>
          <EliminarCatalogo id={cat.id} titulo={cat.titulo} slug={cat.slug} publicado={cat.version_publicada} trasBorrar="lista" />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Dato etiqueta="Páginas" valor={paginasVigentes.toLocaleString("en-US")} nota={`Una por producto y género, ordenadas por marca${r.fijas ? ` · incluye ${r.fijas} fija(s)` : ""}`} />
        <Dato
          etiqueta="Por agregar imagen"
          valor={porAgregarImagen.toLocaleString("en-US")}
          nota={porAgregarImagen > 0 ? "Entran como páginas vacías: súbeles la imagen en el editor" : "Todos los productos tienen imagen"}
        />
        <Dato etiqueta="Sin stock o precio" valor={r.sin_stock.toLocaleString("en-US")} nota="No entran al catálogo" />
        {r.multi_genero === undefined ? (
          // Catálogos generados antes de «una página por género»: se conservó una sola fila por código.
          <Dato etiqueta="Códigos repetidos" valor={r.duplicados.toLocaleString("en-US")} nota="Se conservó la primera fila (generado antes del cambio por género)" />
        ) : (
          <Dato
            etiqueta="Códigos en varios géneros"
            valor={r.multi_genero.toLocaleString("en-US")}
            nota={`Una página por género${r.duplicados > 0 ? ` · ${r.duplicados} fila(s) idéntica(s) omitida(s)` : ""}`}
          />
        )}
      </div>

      {r.consulta_parcial && (
        <p className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          Este catálogo es tan grande que el ERP se consultó por marca. Si el ERP tiene una marca que STOCK todavía no conoce, sus productos pudieron quedar fuera: actualiza
          STOCK y vuelve a sincronizar.
        </p>
      )}
      {(r.sin_explicar ?? 0) !== 0 && (
        <p className="mb-6 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {Math.abs(r.sin_explicar ?? 0).toLocaleString("en-US")} fila(s) del ERP no cuadran con lo contado (ni entraron ni tienen motivo de descarte). Avísale a quien mantiene el sistema.
        </p>
      )}
      {r.sin_plantilla && (
        <p className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          Quedaron fuera por no tener plantilla de su marca:{" "}
          {Object.entries(r.sin_plantilla)
            .map(([marca, n]) => `${marca} (${n})`)
            .join(", ")}
          . Con el diseño de esa marca entrarían.
        </p>
      )}
      {r.fuera_de_precio !== undefined && (
        <p className="mb-6 text-xs text-muted-foreground">
          {r.fuera_de_precio.toLocaleString("en-US")} fila(s) del ERP quedaron fuera del rango de precio pedido.
        </p>
      )}

      {r.fuera_de_talla !== undefined && (
        <p className="mb-6 text-xs text-muted-foreground">
          {r.fuera_de_talla.toLocaleString("en-US")} fila(s) del ERP quedaron fuera por no tener stock en las tallas pedidas.
        </p>
      )}

      {r.sin_imagen.length > 0 && (
        <details className="mb-6 rounded-lg border border-border px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-foreground">Ver códigos que entraron sin imagen al generar ({r.sin_imagen.length})</summary>
          <p className="mt-2 break-words font-mono text-xs text-muted-foreground">
            {r.sin_imagen.slice(0, 200).join(", ")}
            {r.sin_imagen.length > 200 && ` … y ${r.sin_imagen.length - 200} más`}
          </p>
        </details>
      )}

      <section className="mb-8 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Enlace para clientes</h2>
        {enlaces ? (
          <div className="max-w-2xl space-y-3">
            <EnlaceCatalogo etiqueta="Siempre muestra la versión vigente" url={enlaces.principal} />
            {enlaces.alterno !== enlaces.principal && (
              <EnlaceCatalogo etiqueta="Alternativo (mismo servidor; útil desde el celular en la misma red)" url={enlaces.alterno} />
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Aún no está publicado: al publicar se crea el enlace fijo para los clientes.</p>
            <PublicarCatalogo id={cat.id} version={null} />
          </>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground">Versiones</h2>
        <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
          {versiones.length > 0
            ? "Haz clic en una versión para editarla. Al publicar sale como una versión nueva y el enlace pasa a mostrarla; las anteriores se conservan."
            : "Todavía no hay versiones: abre el borrador, ordénalo y publícalo."}
        </p>
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {versiones.length === 0 && (
            <li>
              <Link href={`/admin/marketing/catalogos/${cat.id}/editar`} className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/50">
                <span className="font-medium text-foreground">
                  Borrador
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">sin publicar</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {r.paginas.toLocaleString("en-US")} páginas <ChevronRight className="h-4 w-4" />
                </span>
              </Link>
            </li>
          )}
          {versiones.map((x) => (
            <li key={x.version}>
              <Link
                href={`/admin/marketing/catalogos/${cat.id}/editar?version=${x.version}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <span className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                  v{x.version}
                  {x.version === cat.version_publicada && (
                    <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-700 dark:text-green-400">vigente</span>
                  )}
                  {x.sin_imagen > 0 && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                      {x.sin_imagen.toLocaleString("en-US")} por agregar imagen
                    </span>
                  )}
                  {x.con_cambios && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">cambios sin publicar</span>
                  )}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {x.paginas.toLocaleString("en-US")} páginas · {fechaLima(x.publicado_at)}
                    {x.nombre && ` · ${x.nombre}`}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
