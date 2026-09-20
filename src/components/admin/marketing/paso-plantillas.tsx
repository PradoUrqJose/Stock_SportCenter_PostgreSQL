"use client";

// Paso 2 del asistente: SOLO lo que corresponde a los filtros elegidos. Qué plantilla usa cada marca del
// catálogo (la predeterminada o la que se elija), y qué portada, separadores y cierres lleva el documento.
// Subir o administrar diseños se hace desde Catálogos → Subir diseños / Diseños.
import { useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MarcaAfectada } from "@/lib/actions/marketing-disenos";
import { MARCA_GENERICA, TIPOS_CATALOGO, type FijaBiblioteca } from "@/lib/marketing-catalogo";
import { cn } from "@/lib/utils";
import type { DatosCatalogo, Recursos } from "./asistente-catalogo";
import type { DocumentoCatalogo } from "./documento-catalogo";
import { PreviewPlantillas } from "./preview-plantillas";

const SELECT =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function PasoPlantillas({
  recursos,
  datos,
  cambiar,
  marcasCatalogo,
  documento,
  alVolver,
  alAvanzar,
}: {
  recursos: Recursos;
  datos: DatosCatalogo;
  cambiar: (parte: Partial<DatosCatalogo>) => void;
  marcasCatalogo: MarcaAfectada[] | null;
  documento: DocumentoCatalogo;
  alVolver: () => void;
  alAvanzar: () => void;
}) {
  const { base, plantillas } = recursos;
  const [grande, setGrande] = useState<{ src: string; titulo: string } | null>(null);
  const [preview, setPreview] = useState(false);

  const activas = plantillas.filter((p) => p.activa);
  const propias = (m: string) => activas.filter((p) => p.marca === m);
  const hayGenerica = propias(MARCA_GENERICA).length > 0;
  const elegida = (m: string) => {
    const l = propias(m);
    return (l.find((p) => p.id === datos.plantillas[m]) ?? l.find((p) => p.predeterminada) ?? l[0])?.id ?? "";
  };
  const marcas = [...(marcasCatalogo ?? [])].sort((a, b) => a.marca.localeCompare(b.marca));
  const productosSin = documento.sinPlantilla.reduce((a, m) => a + m.productos, 0);
  const nombreTipo = TIPOS_CATALOGO.find((t) => t.id === documento.tipo)?.nombre;

  const miniatura = (f: FijaBiblioteca, nota: string) => (
    <li key={f.id} className="w-40 animate-in fade-in zoom-in-95 fill-mode-both duration-500">
      <button type="button" onClick={() => setGrande({ src: `${base}/${f.imagen}.webp`, titulo: f.nombre })} className="group block w-full overflow-hidden rounded-lg border border-border text-left transition-all hover:-translate-y-0.5 hover:shadow-md" aria-label={`Ver ${f.nombre} en grande`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${base}/${f.imagen}-min.webp`} alt="" loading="lazy" className="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        <span className="block truncate px-2 pt-1 text-[11px] font-medium text-foreground">{f.nombre}</span>
        <span className="block truncate px-2 pb-1.5 text-[10px] text-muted-foreground">{nota}</span>
      </button>
    </li>
  );

  return (
    <section>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Plantillas</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Solo lo que corresponde a estos filtros{nombreTipo ? ` (${nombreTipo})` : ""}. Cada marca usa su plantilla predeterminada; puedes elegir otra. El Preview muestra el documento completo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={alVolver}>
            <ChevronLeft data-icon="inline-start" /> Filtros
          </Button>
          <Button variant="outline" onClick={() => setPreview(true)}>
            <Eye data-icon="inline-start" /> Preview
          </Button>
          <Button onClick={alAvanzar}>
            Avanzar <ChevronRight data-icon="inline-end" />
          </Button>
        </div>
      </header>

      {/* Marcas del catálogo y su plantilla */}
      <div className="mb-8 rounded-xl border border-border p-4 animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500">
        <h3 className="text-sm font-medium text-foreground">Marcas de este catálogo</h3>
        {marcasCatalogo === null ? (
          <p className="mt-2 text-sm text-muted-foreground">Buscando las marcas…</p>
        ) : marcas.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No se encontraron productos con stock para estos filtros en el sistema; igual se consultará el ERP al generar.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {marcas.map((m, i) => {
              const lista = propias(m.marca);
              return (
                <li key={m.marca} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2 animate-in fade-in slide-in-from-left-2 fill-mode-both duration-500" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                  <span className="w-32 shrink-0 text-sm font-medium text-foreground">{m.marca}</span>
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{m.productos.toLocaleString("en-US")} productos</span>
                  {lista.length > 0 ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <select
                        className={cn(SELECT, "max-w-xs")}
                        value={elegida(m.marca)}
                        onChange={(e) => cambiar({ plantillas: { ...datos.plantillas, [m.marca]: e.target.value } })}
                        aria-label={`Plantilla de ${m.marca}`}
                      >
                        {lista.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                            {p.predeterminada ? " (predeterminada)" : ""}
                          </option>
                        ))}
                      </select>
                      {(() => {
                        const p = lista.find((x) => x.id === elegida(m.marca));
                        return p ? (
                          <button type="button" onClick={() => setGrande({ src: `${base}/${p.fondo}.webp`, titulo: `${m.marca} · ${p.nombre}` })} className="shrink-0 overflow-hidden rounded border border-border" aria-label={`Ver la plantilla de ${m.marca} en grande`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`${base}/${p.fondo}.webp`} alt="" loading="lazy" className="aspect-video w-16 object-cover" />
                          </button>
                        ) : null;
                      })()}
                    </div>
                  ) : hayGenerica ? (
                    <span className="text-xs text-muted-foreground">Usa la plantilla genérica</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" /> Sin plantilla: estos productos no entrarán
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {documento.faltaGenerica && documento.sinPlantilla.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              {productosSin.toLocaleString("en-US")} productos de {documento.sinPlantilla.length} marca(s) no tienen plantilla ({documento.sinPlantilla.slice(0, 4).map((m) => m.marca).join(", ")}
              {documento.sinPlantilla.length > 4 ? "…" : ""}). Falta la plantilla genérica: súbela en Catálogos → Subir diseños (archivo <code>PLANTILLA GENERICA</code>).
            </span>
            <a href="/admin/marketing/catalogos/disenos" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2">
              Ver diseños <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>

      {/* Portada, separadores y cierres que corresponden a estos filtros */}
      <div className="space-y-6">
        <div>
          <h3 className="mb-2 text-sm font-medium text-foreground">Al inicio</h3>
          {documento.inicio.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin portada automática para estos filtros; puedes agregar una en el editor.</p>
          ) : (
            <ul className="flex flex-wrap gap-3">{documento.inicio.map((f) => miniatura(f, "Portada · se pone sola"))}</ul>
          )}
        </div>
        {documento.sugeridas.length > 0 && (
          <div>
            <h3 className="mb-1 text-sm font-medium text-foreground">Separadores</h3>
            <p className="mb-2 text-xs text-muted-foreground">Se sugieren para este tipo de catálogo; los ubicas donde corresponda en el editor.</p>
            <ul className="flex flex-wrap gap-3">{documento.sugeridas.map((f) => miniatura(f, "Se ubica en el editor"))}</ul>
          </div>
        )}
        <div>
          <h3 className="mb-2 text-sm font-medium text-foreground">Al final</h3>
          {documento.final.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin páginas finales automáticas.</p>
          ) : (
            <ul className="flex flex-wrap gap-3">{documento.final.map((f) => miniatura(f, f.tipo === "cierre" ? "Cierre · se pone solo" : "Se pone sola"))}</ul>
          )}
        </div>
      </div>

      <Dialog open={grande !== null} onOpenChange={(o) => !o && setGrande(null)}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{grande?.titulo}</DialogTitle>
            <DialogDescription className="sr-only">Vista ampliada del diseño</DialogDescription>
          </DialogHeader>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {grande && <img src={grande.src} alt={grande.titulo} className="w-full rounded-md border border-border" />}
        </DialogContent>
      </Dialog>

      {preview && (
        <PreviewPlantillas
          base={base}
          hojas={documento.hojas}
          alCerrar={() => setPreview(false)}
          alSiguiente={() => {
            setPreview(false);
            alAvanzar();
          }}
        />
      )}
    </section>
  );
}
