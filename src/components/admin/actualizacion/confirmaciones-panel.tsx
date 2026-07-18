"use client";

import { useCallback, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle, Clock, Download, FileSpreadsheet, X, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DiscountBadge } from "@/components/ui/discount-badge";
import { ExpandableList, ExpandableRow } from "@/components/ui/expandable-list";
import { FilterBar, type SelectFilterDef } from "@/components/ui/filter-bar";
import { cerrarLote, sincronizarConfirmaciones } from "@/lib/actions/descuentos";
import { groupConfirmaciones } from "@/lib/product-groups";

export type ConfirmacionFlatRow = {
  cod_universal: string;
  genero: string;
  estado: "pendiente" | "confirmado" | "rechazado";
  tienda_id: string;
  tienda_nombre: string;
  codigo_usado: string | null;
  vendedor_nombre: string | null;
  motivo_rechazo: string | null;
  resuelto_at: string | null;
  snap_marca: string | null;
  snap_modelo: string | null;
  snap_precio_lista: number | null;
  descuento_antes: number;
  descuento_nuevo: number;
};

type Props = {
  rows: ConfirmacionFlatRow[];
  loteId: number;
  loteEstado: "publicado" | "cerrado";
  publishedAt: string;
  headerExtra?: React.ReactNode;
};

function pct(n: number, total: number) {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

function money(n: number | null) {
  return n !== null ? `S/ ${n.toFixed(2)}` : null;
}

const ESTADO_ICON = {
  pendiente: <Clock className="h-3.5 w-3.5 text-amber-500" />,
  confirmado: <CheckCircle className="h-3.5 w-3.5 text-green-600" />,
  rechazado: <XCircle className="h-3.5 w-3.5 text-red-500" />,
};

const FILTERS: SelectFilterDef<ConfirmacionFlatRow>[] = [
  { key: "marca", label: "Marca", getValue: (r) => r.snap_marca },
  { key: "estado", label: "Estado", getValue: (r) => r.estado },
  { key: "tienda", label: "Tienda", getValue: (r) => r.tienda_nombre },
];

export function ConfirmacionesPanel({ rows, loteId, loteEstado, publishedAt, headerExtra }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cerrarOpen, setCerrarOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Totales del lote completo (sin filtrar) — usados para el diálogo de cerrar lote,
  // que debe reflejar el estado real del lote y no la vista filtrada.
  const { totals } = useMemo(() => groupConfirmaciones(rows), [rows]);

  // Filas tras aplicar los filtros de la FilterBar, reportadas vía onFilteredChange
  // para poder mostrar las tarjetas de resumen arriba de todo (por encima de la
  // barra de búsqueda/filtros) reflejando igualmente el filtro activo.
  const [filteredRows, setFilteredRows] = useState<ConfirmacionFlatRow[]>(rows);
  const { totals: filteredTotals } = useMemo(() => groupConfirmaciones(filteredRows), [filteredRows]);

  // Referencia estable: si se recrea en cada render, el useMemo interno de FilterBar
  // nunca memoriza y su useEffect dispara onFilteredChange sin parar.
  const getSearchText = useCallback(
    (r: ConfirmacionFlatRow) => `${r.cod_universal} ${r.snap_marca ?? ""} ${r.snap_modelo ?? ""}`,
    []
  );

  const isPublicado = loteEstado === "publicado";

  return (
    <div className="space-y-6">
      {/* Title + lote header, same row to save vertical space */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Registro de cambios</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
              isPublicado
                ? "border-green-200 dark:border-green-500/25 bg-green-50 dark:bg-green-500/10 text-green-800 dark:text-green-300"
                : "border-gray-200 bg-gray-50 text-gray-700"
            }`}
          >
            <span>
              <span className="font-medium">Lote #{loteId}</span> ·{" "}
              {isPublicado ? "Publicado" : "Cerrado"} el{" "}
              {new Date(publishedAt).toLocaleDateString("es-PE", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </span>
            {isPublicado && (
              <>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setSyncOpen(true)}
                  className="border-blue-200 dark:border-blue-500/25 text-blue-700 dark:text-blue-300 hover:bg-blue-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Sincronizar confirmaciones
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setCerrarOpen(true)}
                  className="border-red-200 dark:border-red-500/25 text-red-700 dark:text-red-300 hover:bg-red-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Cerrar lote
                </Button>
              </>
            )}
          </div>
          {headerExtra}
        </div>
      </div>

      {/* Global summary, refleja los filtros activos de la barra de abajo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total", n: filteredTotals.total, color: "text-foreground", bg: "bg-card" },
          { label: "Pendiente", n: filteredTotals.pendiente, color: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20" },
          { label: "Confirmado", n: filteredTotals.confirmado, color: "text-green-700 dark:text-green-300", bg: "bg-green-50 dark:bg-green-500/10 border-green-100 dark:border-green-500/20" },
          { label: "Rechazado", n: filteredTotals.rechazado, color: "text-red-700 dark:text-red-300", bg: "bg-red-50 dark:bg-red-500/10 border-red-100 dark:border-red-500/20" },
        ].map(({ label, n, color, bg }) => (
          <div
            key={label}
            className={`rounded-lg border px-4 py-3 ${bg}`}
          >
            <p className={`text-2xl font-bold ${color}`}>{n}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {label}
              {label !== "Total" && filteredTotals.total > 0 && (
                <span className="ml-1 text-muted-foreground">({pct(n, filteredTotals.total)})</span>
              )}
            </p>
          </div>
        ))}
      </div>

      {/* Per-product accordion */}
      <FilterBar
        data={rows}
        filters={FILTERS}
        searchPlaceholder="Buscar por producto o código…"
        getSearchText={getSearchText}
        onFilteredChange={setFilteredRows}
        actions={
          <>
            <a
              href={`/api/lote/${loteId}/export-confirmaciones`}
              download={`confirmaciones-lote-${loteId}.xlsx`}
              className="inline-flex items-center gap-1.5 rounded-md border border-green-200 dark:border-green-500/25 bg-green-50 dark:bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-300 hover:bg-green-100 transition-colors"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Exportar a Excel
            </a>
            {isPublicado && (
              <a
                href={`/api/lote/${loteId}/export`}
                download={`lote-${loteId}.zip`}
                className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 dark:border-blue-500/25 bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Exportar ZIP
              </a>
            )}
          </>
        }
      >
        {(filteredRows) => {
          const { groups: filteredGroups } = groupConfirmaciones(filteredRows);
          return filteredGroups.length === 0 ? (
            <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">Sin confirmaciones que coincidan.</p>
            </div>
          ) : (
            <ExpandableList>
              {filteredGroups.map((g, index) => {
                const isOpen = expanded.has(g.key);
                return (
                  <ExpandableRow
                    key={g.key}
                    rowKey={g.key}
                    index={index}
                    isOpen={isOpen}
                    onToggle={() => toggle(g.key)}
                    header={
                      <>
                        <div className="flex-1 min-w-0">
                          <span className="select-text font-mono text-sm font-semibold text-foreground">
                            {g.cod_universal}
                          </span>
                          <span className="select-text ml-2 text-xs text-muted-foreground">
                            {g.snap_marca ?? "—"} {g.snap_modelo ?? ""}
                          </span>
                          <Badge variant="outline" className="ml-2 text-xs">
                            {g.genero}
                          </Badge>
                        </div>

                        {/* prices + before → after — anchos fijos para que las columnas alineen entre filas */}
                        <div className="hidden shrink-0 items-center gap-1.5 text-sm sm:flex">
                          <span className="w-[4.2rem] text-right font-mono text-xs text-muted-foreground">
                            {money(g.snap_precio_lista) ?? "—"}
                          </span>
                          <DiscountBadge value={g.descuento_antes} />
                          <span className="text-muted-foreground">→</span>
                          <DiscountBadge value={g.descuento_nuevo} />
                          <span className="w-[4.8rem] text-right font-mono text-sm font-semibold text-foreground">
                            {money(g.precio_final) ?? "—"}
                          </span>
                        </div>

                        {/* mini counters — confirmado y pendiente siempre visibles, con ancho fijo */}
                        <div className="shrink-0 flex items-center gap-2 text-xs tabular-nums">
                          <span className="flex w-8 items-center gap-0.5 text-green-700 dark:text-green-300">
                            <CheckCircle className="h-3.5 w-3.5" />
                            {g.n_confirmado}
                          </span>
                          <span className="flex w-8 items-center gap-0.5 text-amber-600">
                            <Clock className="h-3.5 w-3.5" />
                            {g.n_pendiente}
                          </span>
                          {g.n_rechazado > 0 && (
                            <span className="flex items-center gap-0.5 text-red-600">
                              <XCircle className="h-3.5 w-3.5" />
                              {g.n_rechazado}
                            </span>
                          )}
                        </div>
                      </>
                    }
                  >
                    <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-8 py-2 text-left text-xs font-medium text-muted-foreground">Tienda</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Estado</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Vendedor</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Motivo</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Resuelto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {g.tiendas.map((t) => (
                          <tr key={t.tienda_id} className="hover:bg-card transition-colors">
                            <td className="px-8 py-2 font-medium text-foreground">{t.tienda_nombre}</td>
                            <td className="px-3 py-2">
                              <span className="flex items-center gap-1">
                                {ESTADO_ICON[t.estado]}
                                <span
                                  className={
                                    t.estado === "confirmado"
                                      ? "text-green-700 dark:text-green-300"
                                      : t.estado === "rechazado"
                                      ? "text-red-600"
                                      : "text-amber-600"
                                  }
                                >
                                  {t.estado}
                                </span>
                              </span>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {t.vendedor_nombre ?? t.codigo_usado ?? <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {t.motivo_rechazo ? (
                                <span className="text-red-600 italic">{t.motivo_rechazo}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                              {t.resuelto_at ? (
                                new Date(t.resuelto_at).toLocaleDateString("es-PE", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                })
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </ExpandableRow>
                );
              })}
            </ExpandableList>
          );
        }}
      </FilterBar>

      <ConfirmDialog
        open={cerrarOpen}
        onOpenChange={setCerrarOpen}
        title={`Cerrar lote #${loteId}`}
        variant={totals.pendiente === 0 ? "default" : "warning"}
        description={
          totals.pendiente === 0 ? (
            <>
              Todas las tiendas ya respondieron ({totals.confirmado} confirmado
              {totals.confirmado === 1 ? "" : "s"}, {totals.rechazado} rechazado
              {totals.rechazado === 1 ? "" : "s"}). Al cerrar, el lote quedará archivado y no se
              podrán registrar más confirmaciones.
            </>
          ) : (
            <>
              Todavía hay <strong>{totals.pendiente}</strong> confirmación
              {totals.pendiente === 1 ? "" : "es"} pendiente
              {totals.pendiente === 1 ? "" : "s"} de {totals.total}. Si cierras el lote ahora,
              esas tiendas ya no podrán confirmar ni rechazar sus cambios.
            </>
          )
        }
        confirmLabel="Cerrar lote"
        onConfirm={() => cerrarLote(loteId)}
        onSuccess={() => router.refresh()}
      />

      <ConfirmDialog
        open={syncOpen}
        onOpenChange={setSyncOpen}
        title={`Sincronizar confirmaciones del lote #${loteId}`}
        description={
          <>
            Recalcula las confirmaciones contra el stock y las tiendas excluidas actuales: agrega
            confirmaciones para tiendas elegibles que ahora tienen el producto y elimina las{" "}
            <strong>pendientes</strong> de tiendas que ya no lo tienen o que fueron excluidas.
            Las confirmaciones ya resueltas (confirmadas o rechazadas) no se tocan.
          </>
        }
        confirmLabel="Sincronizar"
        onConfirm={() => sincronizarConfirmaciones(loteId)}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
