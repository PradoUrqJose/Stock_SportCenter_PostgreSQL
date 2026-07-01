"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle, Clock, Download, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DiscountBadge } from "@/components/ui/discount-badge";
import { ExpandableList, ExpandableRow } from "@/components/ui/expandable-list";
import { FilterBar, type SelectFilterDef } from "@/components/ui/filter-bar";
import { cerrarLote } from "@/lib/actions/descuentos";
import { groupConfirmaciones, type ProductGroup } from "@/lib/product-groups";

export type ConfirmacionFlatRow = {
  cod_universal: string;
  genero: string;
  estado: "pendiente" | "confirmado" | "rechazado";
  tienda_id: string;
  tienda_nombre: string;
  codigo_usado: string | null;
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

const FILTERS: SelectFilterDef<ProductGroup>[] = [
  { key: "marca", label: "Marca", getValue: (g) => g.snap_marca },
  { key: "estado", label: "Estado", getValue: (g) => g.estadoResumen },
  { key: "tienda", label: "Tienda", getValues: (g) => g.tiendas.map((t) => t.tienda_nombre) },
];

export function ConfirmacionesPanel({ rows, loteId, loteEstado, publishedAt, headerExtra }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cerrarOpen, setCerrarOpen] = useState(false);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const { groups, totals } = useMemo(() => groupConfirmaciones(rows), [rows]);

  const isPublicado = loteEstado === "publicado";

  return (
    <div className="space-y-6">
      {/* Title + lote header, same row to save vertical space */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-[#181d26]">Registro de cambios</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
              isPublicado
                ? "border-green-200 bg-green-50 text-green-800"
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
                <a
                  href={`/api/lote/${loteId}/export`}
                  download={`lote-${loteId}.zip`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Exportar ZIP
                </a>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setCerrarOpen(true)}
                  className="border-red-200 text-red-700 hover:bg-red-50"
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

      {/* Global summary */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total", n: totals.total, color: "text-[#181d26]", bg: "bg-white" },
          { label: "Pendiente", n: totals.pendiente, color: "text-amber-700", bg: "bg-amber-50 border-amber-100" },
          { label: "Confirmado", n: totals.confirmado, color: "text-green-700", bg: "bg-green-50 border-green-100" },
          { label: "Rechazado", n: totals.rechazado, color: "text-red-700", bg: "bg-red-50 border-red-100" },
        ].map(({ label, n, color, bg }) => (
          <div
            key={label}
            className={`rounded-lg border px-4 py-3 ${bg}`}
          >
            <p className={`text-2xl font-bold ${color}`}>{n}</p>
            <p className="mt-0.5 text-xs text-[#41454d]">
              {label}
              {label !== "Total" && totals.total > 0 && (
                <span className="ml-1 text-[#999]">({pct(n, totals.total)})</span>
              )}
            </p>
          </div>
        ))}
      </div>

      {/* Per-product accordion */}
      <FilterBar
        data={groups}
        filters={FILTERS}
        searchPlaceholder="Buscar por producto o código…"
        getSearchText={(g) => `${g.cod_universal} ${g.snap_marca ?? ""} ${g.snap_modelo ?? ""}`}
      >
        {(filteredGroups) =>
          filteredGroups.length === 0 ? (
            <div className="rounded-lg border border-[#dddddd] bg-white px-6 py-12 text-center">
              <p className="text-sm text-[#41454d]">Sin confirmaciones que coincidan.</p>
            </div>
          ) : (
            <ExpandableList>
              {filteredGroups.map((g, index) => {
                const isOpen = expanded.has(g.key);
                const allDone = g.n_pendiente === 0;
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
                          <span className="select-text font-mono text-sm font-semibold text-[#181d26]">
                            {g.cod_universal}
                          </span>
                          <span className="select-text ml-2 text-xs text-[#999]">
                            {g.snap_marca ?? "—"} {g.snap_modelo ?? ""}
                          </span>
                          <Badge variant="outline" className="ml-2 text-xs">
                            {g.genero}
                          </Badge>
                        </div>

                        {/* prices + before → after */}
                        <div className="hidden shrink-0 items-center gap-1.5 text-sm sm:flex">
                          {money(g.snap_precio_lista) && (
                            <span className="font-mono text-xs text-[#999]">{money(g.snap_precio_lista)}</span>
                          )}
                          <DiscountBadge value={g.descuento_antes} />
                          <span className="text-[#bbb]">→</span>
                          <DiscountBadge value={g.descuento_nuevo} />
                          {money(g.precio_final) && (
                            <span className="font-mono text-sm font-semibold text-[#181d26]">
                              {money(g.precio_final)}
                            </span>
                          )}
                        </div>

                        {/* mini counters */}
                        <div className="shrink-0 flex items-center gap-2 text-xs">
                          {g.n_confirmado > 0 && (
                            <span className="flex items-center gap-0.5 text-green-700">
                              <CheckCircle className="h-3.5 w-3.5" />
                              {g.n_confirmado}
                            </span>
                          )}
                          {g.n_pendiente > 0 && (
                            <span className="flex items-center gap-0.5 text-amber-600">
                              <Clock className="h-3.5 w-3.5" />
                              {g.n_pendiente}
                            </span>
                          )}
                          {g.n_rechazado > 0 && (
                            <span className="flex items-center gap-0.5 text-red-600">
                              <XCircle className="h-3.5 w-3.5" />
                              {g.n_rechazado}
                            </span>
                          )}
                          {allDone && <span className="text-[#999]">todas listas</span>}
                        </div>
                      </>
                    }
                  >
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#ebebeb]">
                          <th className="px-8 py-2 text-left text-xs font-medium text-[#41454d]">Tienda</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-[#41454d]">Estado</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-[#41454d]">Vendedor</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-[#41454d]">Motivo</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-[#41454d]">Resuelto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f0f0f0]">
                        {g.tiendas.map((t) => (
                          <tr key={t.tienda_id} className="hover:bg-white transition-colors">
                            <td className="px-8 py-2 font-medium text-[#181d26]">{t.tienda_nombre}</td>
                            <td className="px-3 py-2">
                              <span className="flex items-center gap-1">
                                {ESTADO_ICON[t.estado]}
                                <span
                                  className={
                                    t.estado === "confirmado"
                                      ? "text-green-700"
                                      : t.estado === "rechazado"
                                      ? "text-red-600"
                                      : "text-amber-600"
                                  }
                                >
                                  {t.estado}
                                </span>
                              </span>
                            </td>
                            <td className="px-3 py-2 text-[#41454d]">
                              {t.codigo_usado ?? <span className="text-[#bbb]">—</span>}
                            </td>
                            <td className="px-3 py-2 text-[#41454d]">
                              {t.motivo_rechazo ? (
                                <span className="text-red-600 italic">{t.motivo_rechazo}</span>
                              ) : (
                                <span className="text-[#bbb]">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-[#41454d]">
                              {t.resuelto_at ? (
                                new Date(t.resuelto_at).toLocaleDateString("es-PE", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                })
                              ) : (
                                <span className="text-[#bbb]">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ExpandableRow>
                );
              })}
            </ExpandableList>
          )
        }
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
    </div>
  );
}
