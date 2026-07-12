"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle, Clock, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DiscountBadge } from "@/components/ui/discount-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type ColDef } from "@/components/ui/data-table";
import { FilterBar, type SelectFilterDef } from "@/components/ui/filter-bar";
import { ProductImageThumb } from "@/components/ui/product-image-thumb";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { confirmarAplicacion, rechazarProductos } from "@/lib/actions/confirmaciones";

// A partir de esta cantidad de pendientes seleccionados sin confirmar, se avisa
// al vendedor para que no acumule de más antes de escanear su credencial.
const ALERTA_SELECCION_SIN_CONFIRMAR = 10;

export type ConfirmacionRow = {
  id: number;
  cod_universal: string;
  genero: string;
  estado: "pendiente" | "confirmado" | "rechazado";
  motivo_rechazo: string | null;
  codigo_usado: string | null;
  snap_marca: string | null;
  snap_modelo: string | null;
  snap_precio_lista: number | null;
  descuento_antes: number;
  descuento_nuevo: number;
  grupo: string | null;
  imagen_url: string | null;
};

type Props = {
  confirmaciones: ConfirmacionRow[];
  loteId: number;
  tiendaNombre: string;
  publishedAt: string;
};

function precioFinal(precio: number | null, descuento: number) {
  if (!precio || precio <= 0) return null;
  return precio * (1 - descuento / 100);
}

const ESTADO_BADGE: Record<string, React.ReactNode> = {
  pendiente: (
    <Badge className="border-amber-200 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300">
      <Clock className="mr-1 h-3 w-3" />
      pendiente
    </Badge>
  ),
  confirmado: (
    <Badge className="border-green-200 dark:border-green-500/25 bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300">
      <CheckCircle className="mr-1 h-3 w-3" />
      confirmado
    </Badge>
  ),
  rechazado: (
    <Badge className="border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300">
      <XCircle className="mr-1 h-3 w-3" />
      rechazado
    </Badge>
  ),
};

const FILTERS: SelectFilterDef<ConfirmacionRow>[] = [
  { key: "grupo", label: "Grupo", getValue: (r) => r.grupo },
  { key: "genero", label: "Género", getValue: (r) => r.genero },
  { key: "estado", label: "Estado", getValue: (r) => r.estado },
];

export function ConfirmacionPanel({ confirmaciones, loteId, tiendaNombre, publishedAt }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [codigo, setCodigo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [showRechazo, setShowRechazo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanCodigo, setScanCodigo] = useState("");
  const [scanMsg, setScanMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [scanSubmitting, setScanSubmitting] = useState(false);

  const pendientes = useMemo(() => confirmaciones.filter((c) => c.estado === "pendiente"), [confirmaciones]);
  const confirmados = useMemo(() => confirmaciones.filter((c) => c.estado === "confirmado"), [confirmaciones]);
  const rechazados = useMemo(() => confirmaciones.filter((c) => c.estado === "rechazado"), [confirmaciones]);

  const selectedPendientes = useMemo(() => [...selected].filter((id) => pendientes.some((c) => c.id === id)), [selected, pendientes]);

  function toggleAllVisible(visible: ConfirmacionRow[]) {
    const visiblePendientes = visible.filter((c) => c.estado === "pendiente");
    const allSelected = visiblePendientes.length > 0 && visiblePendientes.every((c) => selected.has(c.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of visiblePendientes) {
        if (allSelected) next.delete(c.id);
        else next.add(c.id);
      }
      return next;
    });
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function closeScan(open: boolean) {
    if (scanSubmitting) return; // no cerrar mientras se procesa el escaneo
    setScanOpen(open);
    if (!open) {
      setScanCodigo("");
      setScanMsg(null);
    }
  }

  async function handleScanConfirm(e: React.FormEvent) {
    e.preventDefault();
    setScanSubmitting(true);
    setScanMsg(null);
    const result = await confirmarAplicacion(scanCodigo, selectedPendientes);
    if (result.success) {
      setSelected(new Set());
      setScanCodigo("");
      setScanOpen(false);
      router.refresh();
    } else {
      setScanMsg({ text: result.msg, ok: false });
    }
    setScanSubmitting(false);
  }

  async function handleRechazar() {
    if (!showRechazo) {
      setShowRechazo(true);
      return;
    }
    setSubmitting(true);
    setMsg(null);
    const result = await rechazarProductos(codigo, motivo, selectedPendientes);
    setMsg({ text: result.msg, ok: result.success });
    if (result.success) {
      setSelected(new Set());
      setMotivo("");
      setShowRechazo(false);
      router.refresh();
    }
    setSubmitting(false);
  }

  const somePendientesSelected = selectedPendientes.length > 0;

  function buildColumns(visible: ConfirmacionRow[]): ColDef<ConfirmacionRow>[] {
    const visiblePendientes = visible.filter((c) => c.estado === "pendiente");
    const allVisibleSelected =
      visiblePendientes.length > 0 && visiblePendientes.every((c) => selected.has(c.id));

    return [
    {
      key: "select",
      header:
        visiblePendientes.length > 0 ? (
          <Checkbox
            checked={allVisibleSelected}
            onCheckedChange={() => toggleAllVisible(visible)}
            aria-label="Seleccionar/deseleccionar pendientes visibles"
          />
        ) : null,
      align: "center",
      width: 0.4,
      cell: (c) => (c.estado === "pendiente" ? <div className="flex justify-center"><Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleOne(c.id)} aria-label={`Seleccionar ${c.snap_marca ?? c.cod_universal}`} /></div> : null),
    },
    {
      key: "imagen",
      header: "Imagen",
      align: "center",
      width: 0.7,
      cell: (c) => <ProductImageThumb imagenUrl={c.imagen_url} codigo={c.cod_universal} label={`${c.snap_marca ?? "—"} ${c.snap_modelo ?? ""}`} />,
    },
    {
      key: "codigo",
      header: "Código",
      width: 1,
      sortable: true,
      sortValue: (c) => c.cod_universal,
      cell: (c) => <span className="font-mono text-xs text-muted-foreground">{c.cod_universal}</span>,
    },
    {
      key: "grupo",
      header: "Grupo",
      width: 1,
      sortable: true,
      sortValue: (c) => c.grupo ?? "",
      cell: (c) => <span className="text-sm">{c.grupo ?? "—"}</span>,
    },
    {
      key: "modelo",
      header: "Modelo",
      width: 2,
      sortable: true,
      sortValue: (c) => c.snap_modelo ?? "",
      cell: (c) => (
        <div>
          <div className="font-medium text-foreground">{c.snap_modelo ?? "—"}</div>
          <div className="text-xs text-muted-foreground">{c.snap_marca ?? ""}</div>
        </div>
      ),
    },
    {
      key: "genero",
      header: "Género",
      width: 0.8,
      sortable: true,
      sortValue: (c) => c.genero,
      cell: (c) => <Badge variant="outline">{c.genero}</Badge>,
    },
    {
      key: "antes",
      header: "Antes",
      align: "right",
      width: 0.8,
      sortable: true,
      sortValue: (c) => c.descuento_antes,
      cell: (c) => (
        <div className="flex justify-end">
          <DiscountBadge value={c.descuento_antes} />
        </div>
      ),
    },
    {
      key: "despues",
      header: "Después",
      align: "right",
      width: 0.8,
      sortable: true,
      sortValue: (c) => c.descuento_nuevo,
      cell: (c) => (
        <div className="flex justify-end">
          <DiscountBadge value={c.descuento_nuevo} />
        </div>
      ),
    },
    {
      key: "lista",
      header: "Lista",
      align: "right",
      width: 0.9,
      sortable: true,
      sortValue: (c) => c.snap_precio_lista ?? 0,
      cell: (c) => (c.snap_precio_lista && c.snap_precio_lista > 0 ? <span className="text-sm">S/ {c.snap_precio_lista.toFixed(2)}</span> : <span className="text-gray-400">—</span>),
    },
    {
      key: "p_final",
      header: "P. final",
      align: "right",
      width: 0.9,
      sortable: true,
      sortValue: (c) => precioFinal(c.snap_precio_lista, c.descuento_nuevo) ?? 0,
      cell: (c) => {
        const pf = precioFinal(c.snap_precio_lista, c.descuento_nuevo);
        return <span className="text-sm font-medium text-foreground">{pf !== null ? `S/ ${pf.toFixed(2)}` : "—"}</span>;
      },
    },
    {
      key: "estado",
      header: "Estado",
      width: 1.4,
      sortable: true,
      sortValue: (c) => c.estado,
      cell: (c) => (
        <div>
          <div>{ESTADO_BADGE[c.estado]}</div>
          {c.estado === "rechazado" && c.motivo_rechazo && <div className="mt-1 text-xs text-red-600">{c.motivo_rechazo}</div>}
          {c.estado !== "pendiente" && c.codigo_usado && <div className="mt-0.5 text-xs text-muted-foreground">Cód: {c.codigo_usado}</div>}
        </div>
      ),
    },
    ];
  }

  return (
    <div className="space-y-4">
      {/* Title + lote banner, same row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Actualización de precios</h1>
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 dark:border-blue-500/25 bg-blue-50 dark:bg-blue-500/10 px-3 py-1.5 text-sm text-blue-800 dark:text-blue-300">
          <span className="font-medium">Lote #{loteId}</span> · Tienda {tiendaNombre} ·{" "}
          {new Date(publishedAt).toLocaleDateString("es-PE", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </div>
      </div>

      <FilterBar
        data={confirmaciones}
        filters={FILTERS}
        searchPlaceholder="Buscar por código, marca o modelo…"
        getSearchText={(c) => `${c.cod_universal} ${c.snap_marca ?? ""} ${c.snap_modelo ?? ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {pendientes.length > 0 && (
              <Button
                size="sm"
                onClick={() => setScanOpen(true)}
                disabled={!somePendientesSelected}
                className="h-7 bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Confirmar ({selectedPendientes.length})
              </Button>
            )}

            {selectedPendientes.length >= ALERTA_SELECCION_SIN_CONFIRMAR && (
              <div className="flex items-center gap-1.5 rounded-md border border-amber-200 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Tienes {selectedPendientes.length} seleccionados sin confirmar — te recomendamos confirmar tus avances.
              </div>
            )}

            <div className="grid h-14 grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="flex h-14 flex-col items-center justify-center rounded-lg border border-border bg-card px-3 text-center">
                <p className="text-lg font-bold text-foreground">{confirmaciones.length}</p>
                <p className="text-[11px] text-muted-foreground">Total</p>
              </div>
              <div className="flex h-14 flex-col items-center justify-center rounded-lg border border-amber-100 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-3 text-center">
                <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{pendientes.length}</p>
                <p className="text-[11px] text-muted-foreground">Pendiente</p>
              </div>
              <div className="flex h-14 flex-col items-center justify-center rounded-lg border border-green-100 dark:border-green-500/20 bg-green-50 dark:bg-green-500/10 px-3 text-center">
                <p className="text-lg font-bold text-green-700 dark:text-green-300">{confirmados.length}</p>
                <p className="text-[11px] text-muted-foreground">Confirmado</p>
              </div>
              <div className="flex h-14 flex-col items-center justify-center rounded-lg border border-red-100 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 px-3 text-center">
                <p className="text-lg font-bold text-red-700 dark:text-red-300">{rechazados.length}</p>
                <p className="text-[11px] text-muted-foreground">Rechazado</p>
              </div>
            </div>
          </div>
        }
      >
        {(filtered) => (
          <DataTable
            columns={buildColumns(filtered)}
            data={filtered}
            keyFn={(c) => String(c.id)}
            defaultSort={{ key: "modelo", dir: "asc" }}
            pageSize={50}
            emptyTitle="Sin confirmaciones que coincidan"
          />
        )}
      </FilterBar>
      {/* Action bar — only shown when there are pending items */}
      {pendientes.length > 0 && (
        <div className="rounded-lg border border-border bg-card px-4 py-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Código de vendedor</label>
              <Input
                placeholder="Ej: V001"
                value={codigo}
                onChange={(e) => {
                  setCodigo(e.target.value);
                  setMsg(null);
                }}
                className="w-40 uppercase"
              />
            </div>

            {showRechazo && (
              <div className="flex-1 space-y-1 min-w-48">
                <label className="text-xs font-medium text-muted-foreground">Motivo de rechazo</label>
                <Input placeholder="Ej: Etiqueta ya aplicada" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              </div>
            )}

            <div className="flex items-center gap-2 pb-0.5">
              <Button
                size="sm"
                variant="outline"
                onClick={handleRechazar}
                disabled={!somePendientesSelected || submitting || (showRechazo && !motivo.trim())}
                className="border-red-200 dark:border-red-500/25 text-red-700 dark:text-red-300 hover:bg-red-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                {showRechazo ? `Enviar rechazo (${selectedPendientes.length})` : `Rechazar (${selectedPendientes.length})`}
              </Button>

              {showRechazo && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowRechazo(false);
                    setMotivo("");
                  }}
                  className="text-muted-foreground"
                >
                  Cancelar
                </Button>
              )}
            </div>
          </div>

          {msg && <p className={`text-xs ${msg.ok ? "text-green-700 dark:text-green-300" : "text-red-600"}`}>{msg.text}</p>}
        </div>
      )}

      <Dialog open={scanOpen} onOpenChange={closeScan}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar {selectedPendientes.length} producto(s)</DialogTitle>
            <DialogDescription>
              Escanea tu credencial con la pistola lectora de código de barras.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleScanConfirm} className="space-y-3">
            <Input
              type="password"
              autoFocus
              autoComplete="off"
              placeholder="Escanea tu credencial…"
              value={scanCodigo}
              onChange={(e) => {
                setScanCodigo(e.target.value);
                setScanMsg(null);
              }}
            />
            {scanMsg && <p className="text-xs text-red-600">{scanMsg.text}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => closeScan(false)} disabled={scanSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={scanSubmitting || !scanCodigo.trim()} className="bg-green-600 hover:bg-green-700">
                {scanSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Confirmar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
