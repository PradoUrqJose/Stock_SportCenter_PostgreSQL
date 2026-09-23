import Link from "next/link";
import { Palette, Plus, Tags } from "lucide-react";
import { db } from "@/lib/db";
import { requireMarketing } from "@/lib/marketing";
import { SubirDisenosMasivo } from "@/components/admin/marketing/subir-disenos-masivo";
import { cerrarGeneracionesAbandonadas } from "@/lib/marketing-generacion";
import { fechaLima, normalizarFiltros, textoFiltros } from "@/lib/marketing-catalogo";
import { tiposCatalogo } from "@/lib/marketing-tipos";
import { EliminarCatalogo } from "@/components/admin/marketing/acciones-catalogo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Fila = {
  id: string;
  slug: string;
  titulo: string;
  version_publicada: number | null;
  paginas: number;
  updated_at: string;
};

type Generacion = {
  id: string;
  titulo: string;
  filtros: string;
  estado: "en_curso" | "listo" | "error";
  mensaje: string | null;
  catalogo_id: string | null;
  created_at: string;
  segundos: number;
  nombre: string | null;
  modo: "nuevo" | "sincronizar";
  base_version: number | null;
};

const ESTADO_GENERACION = {
  en_curso: { texto: "En curso", clase: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  listo: { texto: "Listo", clase: "bg-green-500/15 text-green-700 dark:text-green-400" },
  error: { texto: "Error", clase: "bg-destructive/15 text-destructive" },
} as const;

export default async function CatalogosPage() {
  await requireMarketing();
  await cerrarGeneracionesAbandonadas();
  const marcas = (await db.execute("SELECT marca FROM productos WHERE marca IS NOT NULL GROUP BY 1 ORDER BY COUNT(*) DESC, 1")).rows.map((r) => r.marca as string);
  const tipos = await tiposCatalogo();

  const r = await db.execute(
    `SELECT c.id, c.slug, c.titulo, c.version_publicada, c.updated_at,
            COALESCE(v.paginas, (c.borrador::jsonb -> 'resumen' ->> 'paginas')::int) AS paginas
     FROM mk_catalogos c
     LEFT JOIN mk_catalogo_versiones v ON v.catalogo_id = c.id AND v.version = c.version_publicada
     ORDER BY c.created_at DESC`
  );
  const catalogos = r.rows as unknown as Fila[];

  const g = await db.execute(
    `SELECT g.id, g.titulo, g.filtros, g.estado, g.mensaje, g.catalogo_id, g.created_at, g.modo, g.base_version, u.nombre,
            EXTRACT(EPOCH FROM (COALESCE(g.finished_at, now_text())::timestamp - g.created_at::timestamp))::int AS segundos
     FROM mk_generaciones g LEFT JOIN users u ON u.id = g.created_by
     WHERE g.modo <> 'precarga'
     ORDER BY g.created_at DESC LIMIT 15`
  );
  const generaciones = g.rows as unknown as Generacion[];

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Catálogos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Un clic abre el catálogo con sus versiones, y desde ahí eliges cuál editar. Cada catálogo tiene un enlace fijo para los clientes: al publicar una versión nueva, el mismo enlace la muestra.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/marketing/catalogos/disenos" className={cn(buttonVariants({ variant: "ghost" }))}>
            <Palette data-icon="inline-start" /> Diseños
          </Link>
          <Link href="/admin/marketing/catalogos/tipos" className={cn(buttonVariants({ variant: "ghost" }))}>
            <Tags data-icon="inline-start" /> Tipos
          </Link>
          <SubirDisenosMasivo marcas={marcas} tipos={tipos.map((t) => ({ id: t.id, nombre: t.nombre }))} />
          <Link href="/admin/marketing/catalogos/nuevo" className={cn(buttonVariants())}>
            <Plus data-icon="inline-start" /> Nuevo catálogo
          </Link>
        </div>
      </div>

      {catalogos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Todavía no hay catálogos. Crea el primero con «Nuevo catálogo».
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {catalogos.map((c) => (
            <li key={c.id} className="flex items-center gap-1 pr-2">
              <Link href={`/admin/marketing/catalogos/${c.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{c.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.paginas?.toLocaleString("en-US")} páginas · actualizado {fechaLima(c.updated_at)}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                    c.version_publicada
                      ? "bg-green-500/15 text-green-700 dark:text-green-400"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {c.version_publicada ? `Publicado v${c.version_publicada}` : "Borrador"}
                </span>
              </Link>
              <EliminarCatalogo id={c.id} titulo={c.titulo} slug={c.slug} publicado={c.version_publicada} compacto />
            </li>
          ))}
        </ul>
      )}

      {generaciones.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold text-foreground">Historial de generaciones y sincronizaciones</h2>
          <p className="mb-2 mt-0.5 text-xs text-muted-foreground">Cada vez que se pide un catálogo nuevo o se sincroniza uno con el ERP, con sus filtros y el resultado.</p>
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {generaciones.map((g) => {
              const est = ESTADO_GENERACION[g.estado];
              const sincroniza = g.modo === "sincronizar";
              const destino =
                g.estado === "listo" && g.catalogo_id
                  ? `/admin/marketing/catalogos/${g.catalogo_id}`
                  : g.estado === "en_curso"
                    ? sincroniza && g.catalogo_id
                      ? `/admin/marketing/catalogos/${g.catalogo_id}/sincronizar?generacion=${g.id}${g.base_version === null ? "" : `&version=${g.base_version}`}`
                      : `/admin/marketing/catalogos/nuevo?generacion=${g.id}`
                    : null;
              const contenido = (
                <>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {sincroniza && <span className="mr-1.5 rounded-full bg-muted px-1.5 py-0.5 align-middle text-[10px] font-normal text-muted-foreground">Sincronización{g.base_version !== null ? ` · v${g.base_version}` : ""}</span>}
                      {g.titulo}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{textoFiltros(normalizarFiltros(JSON.parse(g.filtros)), tipos).join(" · ")}</p>
                    {g.estado === "error" && g.mensaje && <p className="mt-0.5 text-xs text-destructive">{g.mensaje}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
                    <span className={cn("rounded-full px-2 py-0.5 font-medium", est.clase)}>{est.texto}</span>
                    <span>
                      {fechaLima(g.created_at)} · {g.segundos} s{g.nombre && ` · ${g.nombre}`}
                    </span>
                  </div>
                </>
              );
              return (
                <li key={g.id}>
                  {destino ? (
                    <Link href={destino} className="flex items-center justify-between gap-4 px-4 py-2.5 transition-colors hover:bg-muted/50">
                      {contenido}
                    </Link>
                  ) : (
                    <div className="flex items-center justify-between gap-4 px-4 py-2.5">{contenido}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
