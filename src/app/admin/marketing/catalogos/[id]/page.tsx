import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { enlacesCatalogo, requireMarketing } from "@/lib/marketing";
import type { Borrador, FiltrosCatalogo } from "@/lib/marketing-catalogo";
import { EnlaceCatalogo, PublicarCatalogo } from "@/components/admin/marketing/acciones-catalogo";

type Catalogo = {
  id: string;
  slug: string;
  titulo: string;
  filtros: string;
  borrador: string;
  version_publicada: number | null;
  created_at: string;
};
type Version = { version: number; paginas: number; publicado_at: string; nombre: string | null; con_cambios: boolean };

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
  const filtros = JSON.parse(cat.filtros) as FiltrosCatalogo;
  const r = borrador.resumen;

  const v = await db.execute({
    sql: `SELECT v.version, v.paginas, v.publicado_at, u.nombre, (v.borrador IS NOT NULL) AS con_cambios
          FROM mk_catalogo_versiones v LEFT JOIN users u ON u.id = v.publicado_por
          WHERE v.catalogo_id = ? ORDER BY v.version DESC`,
    args: [id],
  });
  const versiones = v.rows as unknown as Version[];
  const paginasVigentes = versiones.find((x) => x.version === cat.version_publicada)?.paginas ?? r.paginas;
  const enlaces = cat.version_publicada ? await enlacesCatalogo(cat.slug) : null;

  const filtrosTexto = [
    filtros.marca && `Marca: ${filtros.marca}`,
    filtros.grupo && `Grupo: ${filtros.grupo}`,
    filtros.genero && `Género: ${filtros.genero}`,
    `Almacenes: ${filtros.almacenes.join(", ")}`,
  ].filter(Boolean);

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
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Dato etiqueta="Páginas" valor={paginasVigentes.toLocaleString("en-US")} nota="Una por producto y género, ordenadas por marca" />
        <Dato etiqueta="Sin imagen" valor={r.sin_imagen.length.toLocaleString("en-US")} nota="No entran al catálogo" />
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

      {r.sin_imagen.length > 0 && (
        <details className="mb-6 rounded-lg border border-border px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-foreground">Ver códigos sin imagen ({r.sin_imagen.length})</summary>
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
                  {x.con_cambios && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">cambios sin publicar</span>
                  )}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {x.paginas.toLocaleString("en-US")} páginas · {x.publicado_at.slice(0, 16).replace("T", " ")}
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
