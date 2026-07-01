"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Save, AlertTriangle, CheckCircle2, ImageOff, Pencil, ClipboardCheck, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type ColDef } from "@/components/ui/data-table";
import { DiscountBadge } from "@/components/ui/discount-badge";
import { FilterBar, type SelectFilterDef } from "@/components/ui/filter-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { guardarDescuentos, agregarLineasALotePublicado, marcarResanado } from "@/lib/actions/descuentos";
import { guardarImagenProducto } from "@/lib/actions/imagenes";
import { DestinoPicker, type Destino } from "@/components/admin/lote/destino-picker";
import type { LotePublicadoActivo } from "@/lib/queries/lotes";
import type {
  EditorProductoRow,
  LoteActivo,
  LoteLineaRow,
  Desajuste,
  RotacionRow,
} from "@/app/admin/actualizacion/page";
import { cn } from "@/lib/utils";

const LS_KEY = "actualizacion-pendiente";

function EditorImageCell({
  imagenUrl,
  codigo,
  onView,
  onEdit,
}: {
  imagenUrl: string | null;
  codigo: string;
  onView: () => void;
  onEdit: () => void;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="group relative mx-auto h-10 w-10">
      <button
        type="button"
        onClick={imagenUrl ? onView : onEdit}
        title={imagenUrl ? "Ver imagen" : "Agregar imagen"}
        className="relative block h-10 w-10 overflow-hidden rounded"
      >
        {imagenUrl ? (
          <>
            {!loaded && <Skeleton className="absolute inset-0 h-10 w-10 rounded" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagenUrl}
              alt={codigo}
              className={cn("h-10 w-10 object-cover transition-opacity", loaded ? "opacity-100" : "opacity-0")}
              onLoad={() => setLoaded(true)}
              onError={() => setLoaded(true)}
            />
          </>
        ) : (
          <span className="flex h-10 w-10 items-center justify-center bg-gray-50 text-gray-300">
            <ImageOff className="h-4 w-4" />
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onEdit}
        title="Editar imagen"
        className="absolute -right-1 -bottom-1 flex h-4.5 w-4.5 items-center justify-center rounded-full border border-white bg-gray-700 text-white opacity-0 transition-opacity group-hover:opacity-100"
      >
        <Pencil className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}

function rowKey(r: { cod_universal: string; genero: string }) {
  return `${r.cod_universal}|${r.genero}`;
}

function googleImagesUrl(query: string) {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
}

function loadPending(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

type Props = {
  productos: EditorProductoRow[];
  lote: LoteActivo;
  lineas: LoteLineaRow[];
  lineasPublicadas: LoteLineaRow[];
  desajuste: Desajuste;
  rotacion: RotacionRow[];
  publicadoActivo: LotePublicadoActivo | null;
};

type EstadoFila = "pendiente" | "planeado" | "publicado";

const ESTADO_LABEL: Record<EstadoFila, string> = {
  pendiente: "pendiente",
  planeado: "planeado",
  publicado: "publicado",
};

function semaforo(cobertura: number | null): { dot: string; title: string } {
  if (cobertura === null) return { dot: "bg-gray-300", title: "Sin datos de ventas" };
  if (cobertura < 30)    return { dot: "bg-green-500", title: `Cobertura ${cobertura}d — rotación rápida` };
  if (cobertura < 90)    return { dot: "bg-amber-400", title: `Cobertura ${cobertura}d — rotación moderada` };
  return                        { dot: "bg-red-500",   title: `Cobertura ${cobertura}d — rotación lenta, considerar descuento` };
}

const DISCOUNT_OPTIONS = [0, 10, 20, 30, 40, 50, 60, 70];

const BASE_FILTERS: SelectFilterDef<EditorProductoRow>[] = [
  { key: "categoria", label: "Categoría", getValue: (r) => r.categoria },
  { key: "marca", label: "Marca", getValue: (r) => r.marca },
  { key: "color", label: "Color", getValue: (r) => r.color },
  {
    key: "descuento",
    label: "Dto. ERP",
    getValue: (r) => (r.descuento > 0 ? String(r.descuento) : "0"),
    formatOption: (v) => (v === "0" ? "Sin descuento" : `${v}%`),
  },
];

export function EditorTable({ productos, lote, lineas, lineasPublicadas, desajuste, rotacion, publicadoActivo }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<Record<string, number>>({});
  const [destino, setDestino] = useState<Destino>("borrador");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [resanarOpen, setResanarOpen] = useState(false);
  const [desajusteOculto, setDesajusteOculto] = useState(false);
  const [imgEditing, setImgEditing] = useState<EditorProductoRow | null>(null);
  const [imgUrl, setImgUrl] = useState("");
  const [imgSaving, setImgSaving] = useState(false);
  const [imgMsg, setImgMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [imgViewing, setImgViewing] = useState<EditorProductoRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  useEffect(() => {
    setPending(loadPending());
  }, []);

  const savedMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lineas) m.set(rowKey(l), l.descuento_nuevo);
    return m;
  }, [lineas]);

  const publicadoMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lineasPublicadas) m.set(rowKey(l), l.descuento_nuevo);
    return m;
  }, [lineasPublicadas]);

  function estadoDe(key: string): EstadoFila | null {
    if (key in pending) return "pendiente";
    if (savedMap.has(key)) return "planeado";
    if (publicadoMap.has(key)) return "publicado";
    return null;
  }

  const FILTERS = useMemo<SelectFilterDef<EditorProductoRow>[]>(
    () => [
      ...BASE_FILTERS,
      {
        key: "estado",
        label: "Estado",
        getValue: (r) => estadoDe(rowKey(r)),
        formatOption: (v) => ESTADO_LABEL[v as EstadoFila] ?? v,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pending, savedMap, publicadoMap]
  );

  const rotacionMap = useMemo(() => {
    const m = new Map<string, RotacionRow>();
    for (const r of rotacion) m.set(rowKey(r), r);
    return m;
  }, [rotacion]);

  function handleDiscountChange(key: string, value: string, descuentoErp: number) {
    let n = parseFloat(value);
    if (isNaN(n)) n = 0;
    n = Math.max(0, Math.min(100, n));

    const next = { ...pending };
    if (n === descuentoErp) {
      // Elegir el mismo % que el ERP no es un cambio real — vuelve al estado por defecto.
      delete next[key];
    } else {
      next[key] = n;
    }
    setPending(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    setSaveMsg(null);
  }

  function openImgEditor(r: EditorProductoRow) {
    setImgEditing(r);
    setImgUrl(r.imagen_url ?? "");
    setImgMsg(null);
  }

  function openLightbox(r: EditorProductoRow) {
    setImgViewing(r);
  }

  function switchToEditor(r: EditorProductoRow) {
    setImgViewing(null);
    openImgEditor(r);
  }

  async function saveImagenUrl(url: string) {
    if (!imgEditing) return;
    setImgSaving(true);
    setImgMsg(null);
    const result = await guardarImagenProducto(imgEditing.cod_universal, url);
    if (result.success) {
      setImgEditing(null);
      router.refresh();
    } else {
      setImgMsg({ text: result.msg, ok: false });
    }
    setImgSaving(false);
  }

  async function handleSave() {
    const entries = Object.entries(pending);
    if (entries.length === 0) return;
    setSaving(true);
    setSaveMsg(null);

    const payload = entries.map(([key, descuento_nuevo]) => {
      const [cod_universal, genero] = key.split("|");
      return { cod_universal, genero, descuento_nuevo };
    });

    const result =
      destino === "publicado" && publicadoActivo
        ? await agregarLineasALotePublicado(publicadoActivo.id, payload)
        : await guardarDescuentos(payload);

    if (result.success) {
      setPending({});
      localStorage.removeItem(LS_KEY);
      setSaveMsg({ text: result.msg, ok: true });
      router.refresh();
    } else {
      setSaveMsg({ text: result.msg, ok: false });
    }
    setSaving(false);
  }

  async function handleExport() {
    setExporting(true);
    setExportProgress(0);
    const interval = setInterval(() => {
      setExportProgress((p) => p + (90 - p) * 0.15);
    }, 300);

    try {
      const res = await fetch("/api/export/catalogo");
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `catalogo-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setSaveMsg({ text: "No se pudo exportar el catálogo.", ok: false });
    } finally {
      clearInterval(interval);
      setExportProgress(100);
      setTimeout(() => {
        setExporting(false);
        setExportProgress(0);
      }, 600);
    }
  }

  const pendingCount = Object.keys(pending).length;
  const isBorrador = lote?.estado === "borrador";
  const isPublicado = lote?.estado === "publicado";
  const canSave = pendingCount > 0 && !isPublicado;
  const canRevisar = isBorrador && lineas.length > 0;

  const columns: ColDef<EditorProductoRow>[] = [
    {
      key: "imagen",
      header: "Imagen",
      align: "center",
      width: 1,
      cell: (r) => (
        <EditorImageCell
          imagenUrl={r.imagen_url}
          codigo={r.cod_universal}
          onView={() => openLightbox(r)}
          onEdit={() => openImgEditor(r)}
        />
      ),
    },
    {
      key: "cod_universal",
      header: "Cod. Universal",
      sortable: true,
      width: 1,
      sortValue: (r) => r.cod_universal,
      cell: (r) => (
        <span className="font-mono text-xs text-foreground">{r.cod_universal}</span>
      ),
    },
    {
      key: "genero",
      header: "Género",
      sortable: true,
      width: 1,
      sortValue: (r) => r.genero,
      cell: (r) => <Badge variant="outline">{r.genero}</Badge>,
    },
    {
      key: "grupo",
      header: "Grupo",
      sortable: true,
      width: 1,
      sortValue: (r) => r.grupo ?? "",
      cell: (r) => <span className="text-sm">{r.grupo ?? "—"}</span>,
    },
    {
      key: "marca",
      header: "Marca",
      sortable: true,
      width: 1,
      sortValue: (r) => r.marca ?? "",
      cell: (r) => <span className="text-sm">{r.marca ?? "—"}</span>,
    },
    {
      key: "modelo",
      header: "Modelo",
      sortable: true,
      width: 2,
      sortValue: (r) => r.modelo ?? "",
      cell: (r) => <span className="text-sm">{r.modelo ?? "—"}</span>,
    },
    {
      key: "categoria",
      header: "Categoría",
      sortable: true,
      width: 1,
      sortValue: (r) => r.categoria ?? "",
      cell: (r) => <span className="text-sm">{r.categoria ?? "—"}</span>,
    },
    {
      key: "color",
      header: "Color",
      sortable: true,
      width: 1,
      sortValue: (r) => r.color ?? "",
      cell: (r) => <span className="text-sm">{r.color ?? "—"}</span>,
    },
    {
      key: "descuento_erp",
      header: "Dto. Erp",
      align: "center",
      width: 1,
      sortable: true,
      sortValue: (r) => r.descuento,
      cell: (r) => <DiscountBadge value={r.descuento} />,
    },
    {
      key: "descuento_nuevo",
      header: "Dto. Nuevo",
      align: "right",
      width: 1,
      cell: (r) => {
        const key = rowKey(r);
        const hasPending = key in pending;
        const currentValue = hasPending
          ? pending[key]
          : (savedMap.get(key) ?? publicadoMap.get(key) ?? null);
        return (
          <Select
            value={currentValue === null ? null : String(currentValue)}
            onValueChange={(v) => handleDiscountChange(key, v ?? "0", r.descuento)}
            disabled={isPublicado}
          >
            <SelectTrigger size="sm" className="ml-auto w-20">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {DISCOUNT_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={String(opt)}>
                  {opt}%
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
    {
      key: "precio_lista",
      header: "P. Lista",
      align: "right",
      width: 1,
      sortable: true,
      sortValue: (r) => r.precio_lista,
      cell: (r) =>
        r.precio_lista > 0 ? (
          <span className="text-sm">S/ {r.precio_lista.toFixed(2)}</span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: "precio_final",
      header: "P. Final",
      align: "right",
      width: 1,
      cell: (r) => {
        const key = rowKey(r);
        const dto =
          key in pending
            ? pending[key]
            : (savedMap.get(key) ?? publicadoMap.get(key) ?? r.descuento);
        const final = r.precio_lista * (1 - dto / 100);
        return r.precio_lista > 0 ? (
          <span className="text-sm font-medium">S/ {final.toFixed(2)}</span>
        ) : (
          <span className="text-gray-400">—</span>
        );
      },
    },
    {
      key: "estado",
      header: "Estado",
      align: "center",
      width: 1,
      cell: (r) => {
        const estado = estadoDe(rowKey(r));
        if (estado === "pendiente")
          return (
            <Badge className="border-amber-200 dark:border-amber-500/25 bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300">
              pendiente
            </Badge>
          );
        if (estado === "planeado")
          return (
            <Badge className="border-blue-200 dark:border-blue-500/25 bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300">
              planeado
            </Badge>
          );
        if (estado === "publicado")
          return (
            <Badge className="border-green-200 dark:border-green-500/25 bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-300">
              publicado
            </Badge>
          );
        return null;
      },
    },
    {
      key: "rotacion",
      header: "Rot.",
      align: "center",
      width: 1,
      cell: (r) => {
        const rot = rotacionMap.get(rowKey(r));
        if (!rot) return null;
        const { dot, title } = semaforo(rot.cobertura_dias);
        const lines = [
          rot.antiguedad_dias != null ? `Antigüedad: ${rot.antiguedad_dias}d` : null,
          `Vendido 90d: ${rot.vendido_90d}`,
          rot.cobertura_dias != null ? `Cobertura: ${rot.cobertura_dias}d` : "Sin ventas recientes",
        ].filter(Boolean).join(" · ");
        return (
          <span title={lines} className="flex justify-center">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />
          </span>
        );
      },
    },
  ];

  const showDesajuste = !!desajuste && !desajusteOculto;

  return (
    <div className="space-y-4">
      {/* Desajuste banner */}
      {showDesajuste && (
        <div className="flex items-start justify-between rounded-lg border border-orange-200 dark:border-orange-500/25 bg-orange-50 dark:bg-orange-500/10 px-4 py-3 text-sm text-orange-800 dark:text-orange-300">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
            <div>
              <p className="font-medium">
                Desajuste en lote #{desajuste!.loteId} — {desajuste!.n} producto(s) no coinciden con el ERP
              </p>
              <p className="mt-0.5 text-xs text-orange-700 dark:text-orange-300">
                El baseline del ERP (último upload) difiere de los descuentos publicados en ese lote.
                Verifica que el ZIP fue aplicado correctamente. Cuando esté resuelto, marca como resanado.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setResanarOpen(true)}
            className="shrink-0 border-orange-300 dark:border-orange-500/30 text-orange-800 dark:text-orange-300 hover:bg-orange-100"
          >
            <CheckCircle2 className="h-4 w-4" />
            Marcar resanado
          </Button>
        </div>
      )}

      <p className="text-xs text-gray-400">
        {lote
          ? `Borrador #${lote.id} · ${lineas.length} línea(s) guardada(s) · creado ${new Date(lote.created_at).toLocaleDateString("es-PE")}`
          : "Sin borrador activo — se creará al guardar el primer cambio."}
      </p>

      <FilterBar
        data={productos}
        filters={FILTERS}
        searchPlaceholder="Buscar por código, marca o modelo…"
        getSearchText={(r) => `${r.cod_universal} ${r.marca ?? ""} ${r.modelo ?? ""}`}
        actions={
          <>
            {saveMsg && (
              <span className={`text-xs ${saveMsg.ok ? "text-green-700 dark:text-green-300" : "text-red-600"}`}>
                {saveMsg.text}
              </span>
            )}
            {pendingCount > 0 && (
              <span className="text-xs text-amber-700 dark:text-amber-300">
                {pendingCount} cambio(s) sin guardar
              </span>
            )}
            {publicadoActivo && (
              <DestinoPicker value={destino} onChange={setDestino} publicado={publicadoActivo} />
            )}
            {canRevisar && (
              <Button
                size="sm"
                onClick={() => router.push("/admin/actualizacion-updates")}
                className="bg-amber-500 text-white hover:bg-amber-600"
              >
                <ClipboardCheck className="h-4 w-4" />
                Revisar
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={exporting}
              className={`transition-all duration-300 ${exporting ? "min-w-[160px]" : ""}`}
            >
              {exporting ? (
                <div className="flex w-full flex-col gap-1 py-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span>Exportando...</span>
                    <span className="font-bold tabular-nums">{Math.round(exportProgress)}%</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-[#1b61c9] transition-all duration-300 ease-out"
                      style={{ width: `${exportProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar Excel
                </>
              )}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!canSave || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </>
        }
      >
        {(filtered) => (
          <DataTable
            columns={columns}
            data={filtered}
            keyFn={rowKey}
            defaultSort={{ key: "marca", dir: "asc" }}
            pageSize={50}
            emptyTitle="Sin productos"
            emptyDesc="Sube el stock primero."
          />
        )}
      </FilterBar>

      <Dialog
        open={!!imgEditing}
        onOpenChange={(open) => {
          if (!open) {
            setImgEditing(null);
            setImgMsg(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Imagen del producto</DialogTitle>
            <DialogDescription>
              {imgEditing && (
                <a
                  href={googleImagesUrl(imgEditing.cod_universal)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  {imgEditing.cod_universal}
                </a>
              )}{" "}
              · {imgEditing?.marca ?? "—"} {imgEditing?.modelo ?? ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded bg-gray-50">
              {imgUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={imgUrl}
                  src={imgUrl}
                  alt="Vista previa"
                  className="h-24 w-24 rounded object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <ImageOff className="h-6 w-6 text-gray-300" />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="imagen-url">URL de la imagen</Label>
              <Input
                id="imagen-url"
                value={imgUrl}
                onChange={(e) => setImgUrl(e.target.value)}
                placeholder="https://..."
                autoFocus
              />
            </div>

            {imgMsg && (
              <p className={`text-xs ${imgMsg.ok ? "text-green-700 dark:text-green-300" : "text-red-600"}`}>
                {imgMsg.text}
              </p>
            )}
          </div>

          <DialogFooter>
            {imgEditing?.imagen_url && (
              <Button
                variant="outline"
                onClick={() => saveImagenUrl("")}
                disabled={imgSaving}
                className="border-red-200 dark:border-red-500/25 text-red-700 dark:text-red-300 hover:bg-red-50"
              >
                Quitar imagen
              </Button>
            )}
            <Button onClick={() => saveImagenUrl(imgUrl)} disabled={imgSaving}>
              {imgSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {imgSaving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!imgViewing} onOpenChange={(open) => !open && setImgViewing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{imgViewing?.cod_universal}</DialogTitle>
            <DialogDescription>
              {imgViewing?.marca ?? "—"} {imgViewing?.modelo ?? ""}
            </DialogDescription>
          </DialogHeader>

          {imgViewing?.imagen_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgViewing.imagen_url}
              alt={imgViewing.cod_universal}
              className="mx-auto max-h-[60vh] w-auto rounded object-contain"
            />
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => imgViewing && switchToEditor(imgViewing)}
            >
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={resanarOpen}
        onOpenChange={setResanarOpen}
        title={`Marcar el lote #${desajuste?.loteId} como resanado`}
        variant="warning"
        description="Esto descarta la alerta de desajuste entre el ERP y los descuentos publicados en este lote. Solo hazlo si ya verificaste que el ZIP fue aplicado correctamente."
        confirmLabel="Marcar resanado"
        onConfirm={() => marcarResanado(desajuste!.loteId)}
        onSuccess={() => {
          setDesajusteOculto(true);
          router.refresh();
        }}
      />
    </div>
  );
}
