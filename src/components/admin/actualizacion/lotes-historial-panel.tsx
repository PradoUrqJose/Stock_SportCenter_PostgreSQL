"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle, Clock, XCircle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DiscountBadge } from "@/components/ui/discount-badge";
import { ExpandableList, ExpandableRow } from "@/components/ui/expandable-list";
import type { LoteHistorialRow, LoteProductoResumen } from "@/lib/queries/lotes";

export type LoteHistorialConProductos = LoteHistorialRow & {
  productos: LoteProductoResumen[];
};

type Props = {
  lotes: LoteHistorialConProductos[];
};

const ESTADO_STYLE: Record<LoteHistorialRow["estado"], string> = {
  borrador: "border-gray-200 bg-gray-50 text-gray-700",
  publicado: "border-blue-200 dark:border-blue-500/25 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300",
  cerrado: "border-green-200 dark:border-green-500/25 bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300",
};

function fecha(v: string | null) {
  if (!v) return null;
  return new Date(v).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function money(n: number | null) {
  return n !== null ? `S/ ${n.toFixed(2)}` : null;
}

export function LotesHistorialPanel({ lotes }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (lotes.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">Sin lotes registrados</p>
        <p className="mt-1 text-xs text-gray-400">
          Los lotes aparecerán aquí una vez que se guarde un borrador de descuentos.
        </p>
      </div>
    );
  }

  return (
    <ExpandableList>
      {lotes.map((lote, index) => {
        const isOpen = expanded.has(lote.id);
        return (
          <ExpandableRow
            key={lote.id}
            rowKey={String(lote.id)}
            index={index}
            isOpen={isOpen}
            onToggle={() => toggle(lote.id)}
            header={
              <>
                <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-foreground">#{lote.id}</span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${ESTADO_STYLE[lote.estado]}`}
                  >
                    {lote.estado}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {[
                      fecha(lote.created_at) && `creado ${fecha(lote.created_at)}`,
                      fecha(lote.published_at) && `publicado ${fecha(lote.published_at)}`,
                      fecha(lote.closed_at) && `cerrado ${fecha(lote.closed_at)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {lote.resanado_at && (
                    <span className="text-xs text-green-700 dark:text-green-300">resanado {fecha(lote.resanado_at)}</span>
                  )}
                </div>

                <div className="shrink-0 text-xs text-muted-foreground">
                  {lote.n_lineas} producto{lote.n_lineas === 1 ? "" : "s"}
                </div>

                <div className="shrink-0 flex items-center gap-2 text-xs">
                  {lote.n_confirmaciones === 0 ? (
                    <span className="text-muted-foreground">sin confirmaciones</span>
                  ) : (
                    <>
                      <span className="flex items-center gap-0.5 text-green-700 dark:text-green-300">
                        <CheckCircle className="h-3.5 w-3.5" />
                        {lote.n_confirmaciones - lote.n_pendiente - lote.n_rechazado}
                      </span>
                      {lote.n_pendiente > 0 && (
                        <span className="flex items-center gap-0.5 text-amber-600">
                          <Clock className="h-3.5 w-3.5" />
                          {lote.n_pendiente}
                        </span>
                      )}
                      {lote.n_rechazado > 0 && (
                        <span className="flex items-center gap-0.5 text-red-600">
                          <XCircle className="h-3.5 w-3.5" />
                          {lote.n_rechazado}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </>
            }
          >
            {lote.productos.length === 0 ? (
              <p className="px-8 py-4 text-sm text-muted-foreground">Este lote no tiene productos.</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-8 py-2 text-left text-xs font-medium text-muted-foreground">Cod. Universal</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Producto</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Descuento</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">P. Final</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Confirmaciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lote.productos.map((p) => (
                    <tr key={`${p.cod_universal}|${p.genero}`} className="hover:bg-card transition-colors">
                      <td className="px-8 py-2 font-mono text-xs text-foreground">{p.cod_universal}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {p.snap_marca ?? "—"} {p.snap_modelo ?? ""}
                        <Badge variant="outline" className="ml-2 text-xs">
                          {p.genero}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1.5">
                          <DiscountBadge value={p.descuento_antes} />
                          <span className="text-muted-foreground">→</span>
                          <DiscountBadge value={p.descuento_nuevo} />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-foreground">
                        {money(p.precio_final) ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2 text-xs">
                          {lote.n_confirmaciones === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <>
                              <span className="flex items-center gap-0.5 text-green-700 dark:text-green-300">
                                <CheckCircle className="h-3.5 w-3.5" />
                                {p.n_confirmado}
                              </span>
                              {p.n_pendiente > 0 && (
                                <span className="flex items-center gap-0.5 text-amber-600">
                                  <Clock className="h-3.5 w-3.5" />
                                  {p.n_pendiente}
                                </span>
                              )}
                              {p.n_rechazado > 0 && (
                                <span className="flex items-center gap-0.5 text-red-600">
                                  <XCircle className="h-3.5 w-3.5" />
                                  {p.n_rechazado}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
            {lote.estado !== "borrador" && (
              <div className="border-t border-border px-8 py-2.5">
                <Link
                  href={`/admin/actualizacion-updates/${lote.id}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline"
                >
                  Ver detalle completo por tienda
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </ExpandableRow>
        );
      })}
    </ExpandableList>
  );
}
