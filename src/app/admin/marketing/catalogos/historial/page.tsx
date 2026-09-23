import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireMarketing } from "@/lib/marketing";
import { fechaLima, normalizarFiltros, textoFiltros } from "@/lib/marketing-catalogo";
import { tiposCatalogo } from "@/lib/marketing-tipos";
import { VaciarHistorial } from "@/components/admin/marketing/vaciar-historial";
import { cn } from "@/lib/utils";

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

/** Cuántas filas se muestran como mucho: no hay paginación (el volumen normal de un equipo chico no la necesita). */
const TOPE = 200;

/**
 * Historial de generaciones y sincronizaciones: cada vez que se pide un catálogo nuevo o se sincroniza uno con el
 * ERP queda una fila aquí (aunque no se aplique nada), con sus filtros, el resultado y quién lo hizo. Vive aparte de
 * Catálogos para no saturar esa pantalla, y sigue existiendo aunque el catálogo al que apuntaba se borre.
 */
export default async function HistorialPage() {
  await requireMarketing();
  const tipos = await tiposCatalogo();

  const g = await db.execute(
    `SELECT g.id, g.titulo, g.filtros, g.estado, g.mensaje, g.catalogo_id, g.created_at, g.modo, g.base_version, u.nombre,
            EXTRACT(EPOCH FROM (COALESCE(g.finished_at, now_text())::timestamp - g.created_at::timestamp))::int AS segundos
     FROM mk_generaciones g LEFT JOIN users u ON u.id = g.created_by
     WHERE g.modo <> 'precarga'
     ORDER BY g.created_at DESC LIMIT ${TOPE + 1}`
  );
  const generaciones = (g.rows as unknown as Generacion[]).slice(0, TOPE);
  const hayMas = g.rows.length > TOPE;

  return (
    <div className="p-4 md:p-8">
      <Link href="/admin/marketing/catalogos" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" /> Catálogos
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Historial de generaciones y sincronizaciones</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Cada vez que se pide un catálogo nuevo o se sincroniza uno con el ERP, con sus filtros y el resultado, aunque no se aplique nada. No afecta a los catálogos ni a sus
            versiones publicadas.
          </p>
        </div>
        {generaciones.length > 0 && <VaciarHistorial />}
      </div>

      {generaciones.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Todavía no hay nada en el historial.</p>
      ) : (
        <>
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
          {hayMas && (
            <p className="mt-2 text-xs text-muted-foreground">
              Se muestran las últimas {TOPE}. Hay más filas: usa «Vaciar historial» para quitar las que ya no importan.
            </p>
          )}
        </>
      )}
    </div>
  );
}
