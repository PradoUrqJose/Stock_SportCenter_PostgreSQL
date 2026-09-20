"use client";

// Paso 3 del asistente: título del catálogo y posición de la zapatilla sobre cada plantilla (con una
// zapatilla de ejemplo). La posición se guarda en la plantilla y vale para los catálogos que se
// generen desde ahora; los ya generados conservan la suya.
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Minus, Plus, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { iniciarGeneracion } from "@/lib/actions/marketing-catalogos";
import { guardarPosicionZapatilla } from "@/lib/actions/marketing-disenos";
import { MARCA_GENERICA } from "@/lib/marketing-catalogo";
import { cn } from "@/lib/utils";
import type { DatosCatalogo, Recursos } from "./asistente-catalogo";
import type { DocumentoCatalogo } from "./documento-catalogo";

type Pos = { x: number; y: number; w: number };
const iguales = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y && a.w === b.w;

export function PasoFinal({
  recursos,
  datos,
  cambiar,
  documento,
  alVolver,
}: {
  recursos: Recursos;
  datos: DatosCatalogo;
  cambiar: (parte: Partial<DatosCatalogo>) => void;
  documento: DocumentoCatalogo;
  alVolver: () => void;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const { base, ejemplo } = recursos;
  const todasActivas = recursos.plantillas.filter((p) => p.activa);
  // Solo las plantillas de este catálogo (las de sus marcas); si aún no se conocen, las predeterminadas.
  const delCatalogo = documento.plantillas.map((d) => d.plantilla);
  const activas = delCatalogo.length > 0 ? delCatalogo : todasActivas.filter((p) => p.predeterminada);
  const guardada = (id: string): Pos => {
    const z = recursos.plantillas.find((p) => p.id === id)?.zonas.zapatilla;
    return z ? { x: z.x, y: z.y, w: z.w } : { x: 0, y: 0, w: 1000 };
  };

  const [sel, setSel] = useState(() => activas.find((p) => p.predeterminada)?.id ?? activas[0]?.id ?? "");
  // Posiciones retocadas y aún sin guardar (por plantilla).
  const [cambios, setCambios] = useState<Record<string, Pos>>({});
  const [aTodas, setATodas] = useState(true);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ancho, setAncho] = useState(0);
  const lienzo = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{ px: number; py: number; pos: Pos } | null>(null);

  useEffect(() => {
    const el = lienzo.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAncho(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [sel]);

  const plantilla = activas.find((p) => p.id === sel);
  const pos = cambios[sel] ?? guardada(sel);
  const sucia = plantilla ? !iguales(pos, guardada(sel)) : false;
  const k = plantilla && ancho ? ancho / plantilla.ancho : 0;

  const poner = (p: Pos) => setCambios((c) => ({ ...c, [sel]: p }));
  const escalar = (w: number) => {
    const nuevo = Math.max(300, Math.min(1800, Math.round(w)));
    // Se escala desde el centro de la zapatilla.
    poner({ x: Math.round(pos.x - (nuevo - pos.w) / 2), y: Math.round(pos.y - (nuevo - pos.w) / 2), w: nuevo });
  };

  function guardar(): Promise<boolean> {
    if (!plantilla) return Promise.resolve(true);
    const ids = aTodas ? todasActivas.map((p) => p.id) : [sel];
    return guardarPosicionZapatilla(ids, pos).then((r) => {
      setMensaje({ ok: r.success, texto: r.success ? (aTodas ? "Posición guardada en todas las plantillas" : "Posición guardada en esta plantilla") : r.msg });
      if (r.success) {
        setCambios({});
        router.refresh();
      }
      return r.success;
    });
  }

  function generar() {
    setMensaje(null);
    iniciar(async () => {
      // Lo que quedó sin guardar se guarda antes de generar, para que el catálogo salga con esa posición.
      if (sucia && !(await guardar())) return;
      const min = datos.precioMin.trim() === "" ? null : Number(datos.precioMin);
      const max = datos.precioMax.trim() === "" ? null : Number(datos.precioMax);
      const r = await iniciarGeneracion({
        titulo: datos.titulo,
        tipo: datos.tipo,
        almacenes: datos.almacenes,
        grupos: datos.grupos,
        marcas: datos.marcas,
        generos: datos.generos,
        categorias: datos.categorias,
        precio_min: min !== null && Number.isNaN(min) ? null : min,
        precio_max: max !== null && Number.isNaN(max) ? null : max,
        plantillas: datos.plantillas,
        // Lo que se ve en el Preview es lo que se genera.
        portada: documento.portada ? documento.portada.id : null,
        separadores: documento.separadoresElegidos.map((f) => f.id),
      });
      // La generación sigue en segundo plano: se pasa a la pantalla de avance.
      if (r.success && r.data) router.push(`/admin/marketing/catalogos/nuevo?generacion=${r.data.id}`);
      else setMensaje({ ok: false, texto: r.msg });
    });
  }

  return (
    <section>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Título y posición de la zapatilla</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Ponle nombre al catálogo y acomoda la zapatilla sobre la plantilla. Lo que acomodes se aplica a los catálogos que generes desde ahora.
          </p>
        </div>
        <Button variant="ghost" onClick={alVolver} disabled={pendiente}>
          <ChevronLeft data-icon="inline-start" /> Plantillas
        </Button>
      </header>

      <div className="mb-6 max-w-xl space-y-1.5 animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500">
        <Label htmlFor="titulo">Título del catálogo</Label>
        <Input id="titulo" value={datos.titulo} onChange={(e) => cambiar({ titulo: e.target.value })} placeholder="Hombre — Octubre" maxLength={100} disabled={pendiente} autoFocus />
      </div>

      {activas.length === 0 || !ejemplo ? (
        <p className="mb-6 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {activas.length === 0 ? "No hay plantillas para estos filtros: vuelve al paso anterior." : "No hay ninguna imagen de zapatilla para usar de ejemplo."}
        </p>
      ) : (
        <div className="mb-6 grid gap-4 animate-in fade-in slide-in-from-bottom-3 fill-mode-both delay-100 duration-500 lg:grid-cols-[1fr_16rem]">
          <div>
            {/* Plantilla con la zapatilla de ejemplo */}
            <div
              ref={lienzo}
              className="relative w-full select-none overflow-hidden rounded-xl border border-border bg-muted/30 shadow-sm"
              style={{ aspectRatio: plantilla ? `${plantilla.ancho} / ${plantilla.alto}` : "16 / 9" }}
            >
              {plantilla && k > 0 && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${base}/${plantilla.fondo}.webp`} alt="" draggable={false} className="absolute inset-0 h-full w-full" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${base}/derivados/w1200/${encodeURIComponent(ejemplo.cod)}.v${ejemplo.v}.webp`}
                    alt="Zapatilla de ejemplo"
                    draggable={false}
                    className="absolute cursor-grab touch-none active:cursor-grabbing"
                    style={{ left: pos.x * k, top: pos.y * k, width: pos.w * k, height: pos.w * k, outline: "2px dashed rgba(255,255,255,.75)", outlineOffset: -1 }}
                    onPointerDown={(e) => {
                      arrastre.current = { px: e.clientX, py: e.clientY, pos };
                      try {
                        e.currentTarget.setPointerCapture(e.pointerId);
                      } catch {
                        // Sin captura el arrastre igual funciona mientras el puntero siga sobre la imagen.
                      }
                    }}
                    onPointerMove={(e) => {
                      const a = arrastre.current;
                      if (!a) return;
                      poner({ ...a.pos, x: Math.round(a.pos.x + (e.clientX - a.px) / k), y: Math.round(a.pos.y + (e.clientY - a.py) / k) });
                    }}
                    onPointerUp={() => (arrastre.current = null)}
                    onPointerCancel={() => (arrastre.current = null)}
                  />
                </>
              )}
            </div>

            {/* Cambiar de plantilla */}
            <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {activas.map((p) => (
                <li key={p.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setSel(p.id)}
                    aria-pressed={sel === p.id}
                    className={cn("block w-28 overflow-hidden rounded-lg border text-left transition-all duration-300", sel === p.id ? "border-foreground shadow-sm" : "border-border opacity-70 hover:opacity-100")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`${base}/${p.fondo}.webp`} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                    <span className="block truncate px-1.5 py-1 text-[10px]">{p.marca === MARCA_GENERICA ? "Genérica" : p.marca} · {p.nombre}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Controles */}
          <aside className="space-y-4 rounded-xl border border-border p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Tamaño</p>
              <div className="mt-2 flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" aria-label="Más chica" onClick={() => escalar(pos.w / 1.04)}>
                  <Minus />
                </Button>
                <input type="range" min={300} max={1800} step={10} value={pos.w} onChange={(e) => escalar(Number(e.target.value))} className="min-w-0 flex-1" aria-label="Tamaño de la zapatilla" />
                <Button type="button" variant="outline" size="icon" aria-label="Más grande" onClick={() => escalar(pos.w * 1.04)}>
                  <Plus />
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Arrastra la zapatilla sobre la plantilla para ubicarla.</p>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={aTodas} onCheckedChange={(v) => setATodas(v === true)} className="mt-0.5" />
              <span>
                Aplicar a todas las plantillas
                <span className="block text-xs text-muted-foreground">Incluye las de otras marcas. Sirve cuando comparten la misma composición.</span>
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void guardar()} disabled={!sucia || pendiente}>
                Guardar posición
              </Button>
              <Button type="button" variant="outline" onClick={() => setCambios((c) => Object.fromEntries(Object.entries(c).filter(([id]) => id !== sel)))} disabled={!sucia || pendiente}>
                <RotateCcw data-icon="inline-start" /> Deshacer
              </Button>
            </div>
            {sucia && <p className="text-xs text-amber-700 dark:text-amber-400">Cambios sin guardar: se guardan solos al generar.</p>}
          </aside>
        </div>
      )}

      {mensaje && <p className={cn("mb-4 text-sm", mensaje.ok ? "text-green-600 dark:text-green-400" : "text-destructive")}>{mensaje.texto}</p>}

      <div className="flex flex-wrap items-center gap-3 animate-in fade-in slide-in-from-bottom-3 fill-mode-both delay-200 duration-500">
        <Button size="lg" onClick={generar} disabled={pendiente || datos.titulo.trim().length < 3}>
          <Sparkles data-icon="inline-start" /> {pendiente ? "Iniciando…" : "Generar catálogo"}
        </Button>
        <p className="text-xs text-muted-foreground">Corre en segundo plano: verás el avance y puedes salir de la pantalla.</p>
      </div>
    </section>
  );
}
