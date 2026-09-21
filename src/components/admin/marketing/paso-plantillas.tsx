"use client";

// Paso 2 del asistente: SOLO lo que corresponde a los filtros elegidos. Qué plantilla usa cada marca del
// catálogo (la predeterminada o la que se elija), y qué portada, separadores y cierres lleva el documento.
// Aquí mismo se puede subir una portada o la plantilla de una marca (queda elegida al terminar); para muchos archivos
// a la vez, Catálogos → Subir diseños; para administrarlos, Diseños.
import { useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, Eye, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MarcaAfectada } from "@/lib/actions/marketing-disenos";
import { MARCA_GENERICA, type FijaBiblioteca, type TipoCatalogo } from "@/lib/marketing-catalogo";
import { cn } from "@/lib/utils";
import type { DatosCatalogo, Recursos } from "./asistente-catalogo";
import type { DocumentoCatalogo } from "./documento-catalogo";
import { EditorTextoPlantilla } from "./editor-texto-plantilla";
import { GuardarComoTipo } from "./guardar-tipo";
import { PreviewPlantillas } from "./preview-plantillas";
import { SubirDisenoAqui, type DestinoSubida } from "./subir-diseno-aqui";

const SELECT =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function PasoPlantillas({
  recursos,
  datos,
  cambiar,
  marcasCatalogo,
  documento,
  nombreSugerido,
  alGuardarTipo,
  alVolver,
  alAvanzar,
}: {
  recursos: Recursos;
  datos: DatosCatalogo;
  cambiar: (parte: Partial<DatosCatalogo>) => void;
  marcasCatalogo: MarcaAfectada[] | null;
  documento: DocumentoCatalogo;
  /** Nombre que se sugiere al guardar los filtros como tipo. */
  nombreSugerido: string;
  /** Un tipo recién guardado desde aquí: el asistente lo agrega y lo deja elegido. */
  alGuardarTipo: (tipo: TipoCatalogo) => void;
  alVolver: () => void;
  alAvanzar: () => void;
}) {
  const { base, plantillas } = recursos;
  const [grande, setGrande] = useState<{ src: string; titulo: string } | null>(null);
  const [preview, setPreview] = useState(false);
  // Diseño que se está subiendo desde aquí (portada o plantilla de una marca).
  const [subir, setSubir] = useState<DestinoSubida | null>(null);
  // Plantilla recién subida: se abre el editor de dónde van el código, las tallas y el precio.
  const [textosDe, setTextosDe] = useState<string | null>(null);

  const activas = plantillas.filter((p) => p.activa);
  const propias = (m: string) => activas.filter((p) => p.marca === m);
  const hayGenerica = propias(MARCA_GENERICA).length > 0;
  const elegida = (m: string) => {
    const l = propias(m);
    return (l.find((p) => p.id === datos.plantillas[m]) ?? l.find((p) => p.predeterminada) ?? l[0])?.id ?? "";
  };
  const marcas = [...(marcasCatalogo ?? [])].sort((a, b) => a.marca.localeCompare(b.marca));
  const productosSin = documento.sinPlantilla.reduce((a, m) => a + m.productos, 0);
  const nombreTipo = recursos.tipos.find((t) => t.id === documento.tipo)?.nombre;

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
            Solo lo que corresponde a estos filtros{nombreTipo ? ` (${nombreTipo})` : ""}. Cada marca usa su plantilla predeterminada; puedes elegir otra. La portada va asociada al tipo de catálogo. El Preview muestra el documento completo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={alVolver}>
            <ChevronLeft data-icon="inline-start" /> Filtros
          </Button>
          <Button variant="outline" onClick={() => setPreview(true)}>
            <Eye data-icon="inline-start" /> Preview
          </Button>
          <Button onClick={alAvanzar} disabled={documento.portadaPendiente}>
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
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{m.productos.toLocaleString("en-US")} {m.productos === 1 ? "producto" : "productos"}</span>
                  {lista.length > 0 ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <select
                        className={cn(SELECT, "min-w-0 max-w-xs flex-1")}
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
                      <Button type="button" variant="ghost" size="sm" onClick={() => setSubir({ clase: "plantilla", marca: m.marca })} aria-label={`Subir otra plantilla de ${m.marca}`}>
                        <Upload data-icon="inline-start" /> Subir otra
                      </Button>
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
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">Usa la plantilla genérica</span>
                      <Button type="button" variant="outline" size="sm" onClick={() => setSubir({ clase: "plantilla", marca: m.marca })}>
                        <Upload data-icon="inline-start" /> Subir plantilla de {m.marca}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5" /> Sin plantilla: estos productos no entrarán
                      </span>
                      <Button type="button" variant="outline" size="sm" onClick={() => setSubir({ clase: "plantilla", marca: m.marca })}>
                        <Upload data-icon="inline-start" /> Subir plantilla de {m.marca}
                      </Button>
                    </div>
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
              {documento.sinPlantilla.length > 4 ? "…" : ""}). Sube la plantilla de cada marca, o una genérica que se use con todas las que no tengan la suya.
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => setSubir({ clase: "plantilla", marca: MARCA_GENERICA })}>
              <Upload data-icon="inline-start" /> Subir genérica
            </Button>
            <a href="/admin/marketing/catalogos/disenos" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2">
              Ver diseños <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>

      {/* Portada, separadores opcionales y cierres que corresponden a estos filtros */}
      <div className="space-y-7">
        <div>
          <h3 className="mb-1 text-sm font-medium text-foreground">Portada</h3>
          <p className={cn("mb-2 text-xs", documento.portadaPendiente ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
            {documento.portadaPendiente
              ? "Con filtros personalizados, elige una portada o «Sin portada» para continuar."
              : documento.portadaDelTipo && nombreTipo
                ? `La portada asociada a ${nombreTipo} ya está elegida; puedes cambiarla.`
                : "Este tipo no tiene una portada asociada: elige una o déjalo sin portada."}
          </p>
          {documento.portada && documento.portada.zonas?.length === 0 && (
            <p className="mb-2 rounded-md bg-amber-100 px-2.5 py-1.5 text-xs text-amber-900 dark:bg-amber-500/15 dark:text-amber-300">
              «{documento.portada.nombre}» no tiene enlaces clicables: en este catálogo los clientes no podrán tocar WhatsApp ni las redes de la portada. Se dibujan en{" "}
              <a href="/admin/marketing/catalogos/disenos" target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
                Diseños → Zonas clicables
              </a>{" "}
              (se abre en otra pestaña: aquí no pierdes nada).
            </p>
          )}
          <ul className="flex flex-wrap gap-3">
            <li className="w-40">
              <button
                type="button"
                onClick={() => setSubir({ clase: "portada" })}
                className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-foreground/40 text-xs font-medium text-foreground transition-all hover:-translate-y-0.5 hover:bg-muted/50"
              >
                <Plus className="h-4 w-4" /> Subir portada
              </button>
            </li>
            <li className="w-40">
              <button
                type="button"
                onClick={() => cambiar({ portada: null })}
                aria-pressed={!documento.portadaPendiente && documento.portada === null}
                className={cn(
                  "flex aspect-video w-full items-center justify-center rounded-lg border text-xs transition-all hover:-translate-y-0.5",
                  !documento.portadaPendiente && documento.portada === null ? "border-foreground bg-muted font-medium" : "border-dashed border-border text-muted-foreground hover:bg-muted/50"
                )}
              >
                Sin portada
              </button>
            </li>
            {documento.portadas.map((f) => {
              const elegida = documento.portada?.id === f.id;
              return (
                <li key={f.id} className="w-40 animate-in fade-in zoom-in-95 fill-mode-both duration-500">
                  <div className={cn("overflow-hidden rounded-lg border transition-all hover:-translate-y-0.5 hover:shadow-md", elegida ? "border-foreground ring-2 ring-foreground/70" : "border-border")}>
                    <button type="button" onClick={() => cambiar({ portada: f.id })} aria-pressed={elegida} className="block w-full text-left" aria-label={`Elegir ${f.nombre}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`${base}/${f.imagen}-min.webp`} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                      <span className="block truncate px-2 pt-1 text-[11px] font-medium text-foreground">{f.nombre}</span>
                    </button>
                    <div className="flex items-center justify-between px-2 pb-1.5">
                      <span className="text-[10px] text-muted-foreground">{elegida ? (documento.portadaDelTipo?.id === f.id ? "Asociada al tipo" : "Elegida") : " "}</span>
                      <button type="button" onClick={() => setGrande({ src: `${base}/${f.imagen}.webp`, titulo: f.nombre })} className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                        Ver
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {documento.separadores.length > 0 && (
          <div>
            <h3 className="mb-1 text-sm font-medium text-foreground">Separadores (opcional)</h3>
            <p className="mb-2 text-xs text-muted-foreground">Marca los que quieras: entran al principio del catálogo y los ubicas donde corresponda en el editor.</p>
            <ul className="flex flex-wrap gap-3">
              {documento.separadores.map((f) => {
                const marcado = (datos.separadores ?? []).includes(f.id);
                return (
                  <li key={f.id} className="w-40">
                    <label className={cn("block cursor-pointer overflow-hidden rounded-lg border transition-all hover:-translate-y-0.5 hover:shadow-md", marcado ? "border-foreground ring-2 ring-foreground/70" : "border-border")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`${base}/${f.imagen}-min.webp`} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                      <span className="flex items-center gap-2 px-2 py-1.5 text-[11px] font-medium text-foreground">
                        <Checkbox checked={marcado} onCheckedChange={(v) => cambiar({ separadores: v === true ? [...(datos.separadores ?? []), f.id] : (datos.separadores ?? []).filter((x) => x !== f.id) })} />
                        <span className="truncate">{f.nombre}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
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

      {subir && (
        <SubirDisenoAqui
          key={subir.clase === "plantilla" ? `p-${subir.marca}` : "portada"}
          destino={subir}
          existentes={subir.clase === "portada" ? recursos.fijas.filter((f) => f.tipo === "portada").map((f) => f.nombre) : plantillas.filter((p) => p.marca === subir.marca).map((p) => p.nombre)}
          tipo={(() => {
            const t = recursos.tipos.find((x) => x.id === datos.tipo);
            return t ? { id: t.id, nombre: t.nombre } : null;
          })()}
          slotTipo={<GuardarComoTipo filtros={datos} nombreSugerido={nombreSugerido} alGuardar={alGuardarTipo} />}
          alSubir={({ id, reemplazo }) => {
            cambiar(subir.clase === "portada" ? { portada: id } : { plantillas: { ...datos.plantillas, [subir.marca]: id } });
            if (subir.clase === "plantilla" && !reemplazo) setTextosDe(id);
          }}
          alCerrar={() => setSubir(null)}
        />
      )}

      {textosDe && (() => {
        // La plantilla llega con el refresco de los datos: hasta entonces no hay nada que mostrar.
        const p = plantillas.find((x) => x.id === textosDe);
        return p ? (
          <EditorTextoPlantilla
            key={p.id}
            base={base}
            plantilla={p}
            fuente={recursos.fuente}
            nota="Plantilla nueva: copiamos de otra plantilla dónde van el código, las tallas y el precio. Si en este diseño van en otro lugar, acomódalos aquí."
            alCerrar={() => setTextosDe(null)}
          />
        ) : null;
      })()}

      {preview && (
        <PreviewPlantillas
          base={base}
          hojas={documento.hojas}
          alCerrar={() => setPreview(false)}
          alSiguiente={documento.portadaPendiente ? undefined : () => {
            setPreview(false);
            alAvanzar();
          }}
        />
      )}
    </section>
  );
}
