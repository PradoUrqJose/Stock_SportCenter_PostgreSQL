import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireMarketing } from "@/lib/marketing";
import { ALMACENES_POR_DEFECTO, normalizarFiltros, textoFiltros } from "@/lib/marketing-catalogo";
import type { InformeSincronizacion } from "@/lib/marketing-sincronizar";
import { opcionesDeFiltros } from "@/lib/marketing-opciones";
import { tiposCatalogo } from "@/lib/marketing-tipos";
import { AsistenteCatalogo } from "@/components/admin/marketing/asistente-catalogo";
import { ProgresoGeneracion } from "@/components/admin/marketing/progreso-generacion";
import { RevisionSincronizacion } from "@/components/admin/marketing/revision-sincronizacion";

// La consulta al ERP corre en segundo plano dentro de esta misma función (`after`): 300 s es el máximo del plan Hobby con Fluid Compute.
export const maxDuration = 300;

/**
 * Sincronizar un catálogo con el ERP: (1) los filtros del catálogo, editables como en el asistente; (2) el avance de la
 * consulta; (3) la revisión de qué cambia, con «Aplicar». Nada se cambia hasta aplicar, y las versiones ya publicadas
 * nunca se tocan: lo nuevo llega a los clientes cuando se publica una versión nueva.
 */
export default async function SincronizarCatalogoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string; generacion?: string }>;
}) {
  await requireMarketing();
  const { id } = await params;
  const { version, generacion } = await searchParams;

  const c = await db.execute({ sql: "SELECT titulo, filtros, version_publicada FROM mk_catalogos WHERE id = ?", args: [id] });
  if (c.rows.length === 0) notFound();
  const cat = c.rows[0] as unknown as { titulo: string; filtros: string; version_publicada: number | null };

  // Un catálogo publicado se sincroniza desde una versión: sin `version` se toma la vigente.
  if (version === undefined && cat.version_publicada) {
    redirect(`/admin/marketing/catalogos/${id}/sincronizar?version=${cat.version_publicada}${generacion ? `&generacion=${generacion}` : ""}`);
  }
  const versionBase = version === undefined ? null : Number(version);
  if (versionBase !== null && !Number.isInteger(versionBase)) notFound();
  const volverA = `/admin/marketing/catalogos/${id}/editar${versionBase === null ? "" : `?version=${versionBase}`}`;

  const cabecera = (
    <>
      <Link href={volverA} className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" /> Volver al editor
      </Link>
    </>
  );

  // Con ?generacion=<id>: el avance de la consulta y, al terminar, la revisión.
  if (generacion) {
    const g = await db.execute({
      sql: `SELECT titulo, estado, filtros, resultado, aplicada_at FROM mk_generaciones
            WHERE id = ? AND modo = 'sincronizar' AND base_catalogo_id = ?`,
      args: [generacion, id],
    });
    if (g.rows.length > 0) {
      const f = g.rows[0] as unknown as { titulo: string; estado: string; filtros: string; resultado: string | null; aplicada_at: string | null };
      if (f.estado === "listo" && f.aplicada_at) redirect(volverA);
      if (f.estado === "listo" && f.resultado) {
        const { informe } = JSON.parse(f.resultado) as { informe: InformeSincronizacion };
        const usados = normalizarFiltros(JSON.parse(f.filtros));
        const tipos = await tiposCatalogo();
        const antes = textoFiltros(normalizarFiltros(JSON.parse(cat.filtros)), tipos);
        const ahora = textoFiltros(usados, tipos);
        return (
          <div className="p-4 md:p-8">
            {cabecera}
            <h1 className="mb-1 text-xl font-semibold text-foreground">Sincronizar con el ERP</h1>
            <RevisionSincronizacion
              generacionId={generacion}
              catalogoId={id}
              version={versionBase}
              titulo={cat.titulo}
              informe={informe}
              filtrosTexto={ahora}
              filtrosCambiaron={antes.join("|") !== ahora.join("|")}
              volverA={volverA}
            />
          </div>
        );
      }
      return (
        <div className="p-4 md:p-8">
          {cabecera}
          <h1 className="mb-6 text-xl font-semibold text-foreground">Sincronizando con el ERP</h1>
          <ProgresoGeneracion id={generacion} titulo={f.titulo} />
        </div>
      );
    }
  }

  // Sin consulta en curso: los filtros del catálogo, para editarlos como en el asistente.
  const [opciones, tipos] = await Promise.all([opcionesDeFiltros(), tiposCatalogo({ soloActivos: true })]);
  const f = normalizarFiltros(JSON.parse(cat.filtros));
  return (
    <div className="p-4 md:p-8">
      {cabecera}
      <AsistenteCatalogo
        recursos={{ base: "", plantillas: [], fijas: [], ejemplo: null, tipos, fuente: "", opciones }}
        sincronizar={{
          catalogoId: id,
          version: versionBase,
          titulo: cat.titulo,
          volverA,
          inicial: {
            tipo: f.tipo,
            categorias: f.categorias,
            grupos: f.grupos,
            generos: f.generos,
            marcas: f.marcas,
            tallas: f.tallas,
            precioMin: f.precio_min == null ? "" : String(f.precio_min),
            precioMax: f.precio_max == null ? "" : String(f.precio_max),
            almacenes: f.almacenes.length > 0 ? f.almacenes : ALMACENES_POR_DEFECTO,
            plantillas: f.plantillas,
          },
        }}
      />
    </div>
  );
}
