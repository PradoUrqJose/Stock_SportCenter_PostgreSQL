"use client";

// Editor de dónde van el código, las tallas y el precio en una plantilla. Cada uno es una caja sobre la imagen que se
// arrastra y se cambia de tamaño; el texto de ejemplo se dibuja con la tipografía y la regla de ajuste reales
// (la misma del catálogo), así se ve exactamente cómo caerá. La zapatilla tiene su propio ajuste y aquí solo se
// muestra de referencia. Las posiciones están en «px de diseño» (el ancho de la plantilla); la pantalla las escala.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { guardarZonasTexto, type CajaTexto } from "@/lib/actions/marketing-disenos";
import type { PlantillaLista } from "@/lib/marketing-catalogo";
import { ajustar, ALTO_LINEA } from "@/lib/marketing-texto";
import { cn } from "@/lib/utils";

type Clave = "codigo" | "tallas" | "precio";
type Cajas = Record<Clave, CajaTexto>;

const CAJAS: { clave: Clave; nombre: string; borde: string; centro: boolean }[] = [
  { clave: "codigo", nombre: "Código", borde: "border-amber-400 bg-amber-400/15", centro: false },
  { clave: "tallas", nombre: "Tallas", borde: "border-sky-400 bg-sky-400/15", centro: true },
  { clave: "precio", nombre: "Precio", borde: "border-emerald-400 bg-emerald-400/15", centro: true },
];

const EJEMPLO = {
  corto: { codigo: "IG6410", tallas: ["7", "8", "8.5", "9", "9.5"], precio: "S/ 299.00" },
  largo: { codigo: "384139-03", tallas: ["6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "12"], precio: "S/ 1,299.00" },
};

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const desdeZona = (z: PlantillaLista["zonas"][Clave]): CajaTexto => ({ x: z.x, y: z.y, w: z.w, h: z.h, color: z.color ?? "#0143bb", max: z.max ?? 40 });
const iguales = (a: CajaTexto, b: CajaTexto) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.color === b.color && a.max === b.max;

type Gesto = { modo: "mover"; clave: Clave; dx: number; dy: number } | { modo: "redimensionar"; clave: Clave };

export function EditorTextoPlantilla({
  base,
  plantilla,
  fuente,
  nota,
  alCerrar,
}: {
  base: string;
  plantilla: PlantillaLista;
  /** Familia de la tipografía del diseño (Montserrat Black), la misma con la que se dibuja el catálogo. */
  fuente: string;
  /** Aviso opcional arriba (por ejemplo, al terminar de subir una plantilla nueva). */
  nota?: string;
  alCerrar: () => void;
}) {
  const router = useRouter();
  const guardadas = useMemo<Cajas>(
    () => ({ codigo: desdeZona(plantilla.zonas.codigo), tallas: desdeZona(plantilla.zonas.tallas), precio: desdeZona(plantilla.zonas.precio) }),
    [plantilla]
  );
  const [cajas, setCajas] = useState<Cajas>(guardadas);
  const [sel, setSel] = useState<Clave>("codigo");
  const [largo, setLargo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [anchoPx, setAnchoPx] = useState(0);
  const [fuenteLista, setFuenteLista] = useState(false);
  // El lienzo se guarda como estado: el diálogo monta su contenido después de este componente, así que un
  // `useRef` leído en un efecto inicial aún estaría vacío y el ancho (y con él el tamaño de letra) quedaría en 0.
  const [lienzo, setLienzo] = useState<HTMLDivElement | null>(null);
  const gesto = useRef<Gesto | null>(null);

  useEffect(() => {
    if (!lienzo) return;
    const ro = new ResizeObserver(() => setAnchoPx(lienzo.clientWidth));
    ro.observe(lienzo);
    return () => ro.disconnect();
  }, [lienzo]);

  // El texto se mide con la tipografía ya cargada: hasta entonces se vería un tamaño distinto.
  useEffect(() => {
    let vivo = true;
    document.fonts
      .load(`900 20px ${fuente}`)
      .catch(() => undefined)
      .then(() => vivo && setFuenteLista(true));
    return () => {
      vivo = false;
    };
  }, [fuente]);

  // El canvas de medida se crea al primer uso (en el servidor no existe `document`); `fuenteLista` fuerza a
  // re-medir cuando llega la tipografía.
  const util = useMemo(() => {
    let g: CanvasRenderingContext2D | null = null;
    const medir = (texto: string, px: number) => {
      g ??= document.createElement("canvas").getContext("2d")!;
      g.font = `900 ${px}px ${fuente}`;
      return g.measureText(texto).width;
    };
    return { medir };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fuente, fuenteLista]);

  const k = anchoPx / plantilla.ancho;
  const ejemplo = largo ? EJEMPLO.largo : EJEMPLO.corto;
  const sucia = CAJAS.some(({ clave }) => !iguales(cajas[clave], guardadas[clave]));
  const cambiar = (clave: Clave, parte: Partial<CajaTexto>) => setCajas((c) => ({ ...c, [clave]: { ...c[clave], ...parte } }));

  const punto = (e: React.PointerEvent) => {
    const r = lienzo!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * plantilla.ancho, y: ((e.clientY - r.top) / r.height) * plantilla.alto };
  };
  function alMover(e: React.PointerEvent) {
    const g = gesto.current;
    if (!g) return;
    const p = punto(e);
    const c = cajas[g.clave];
    if (g.modo === "mover") cambiar(g.clave, { x: Math.round(limitar(p.x - g.dx, 0, plantilla.ancho - c.w)), y: Math.round(limitar(p.y - g.dy, 0, plantilla.alto - c.h)) });
    else cambiar(g.clave, { w: Math.round(limitar(p.x - c.x, 30, plantilla.ancho - c.x)), h: Math.round(limitar(p.y - c.y, 16, plantilla.alto - c.y)) });
  }

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    const r = await guardarZonasTexto(plantilla.id, cajas);
    setGuardando(false);
    if (!r.success) {
      setMensaje({ ok: false, texto: r.msg });
      return;
    }
    router.refresh();
    alCerrar();
  }

  // Texto de una caja tal como se dibuja en el catálogo: mismo ajuste de tamaño, líneas centradas o a la izquierda.
  const texto = (clave: Clave) => {
    const c = cajas[clave];
    const partes = clave === "tallas" ? ejemplo.tallas : [clave === "codigo" ? ejemplo.codigo : ejemplo.precio];
    return ajustar(partes, { x: c.x, y: c.y, w: c.w, h: c.h, max: c.max }, clave === "tallas" ? " · " : "", util.medir);
  };

  const cajaSel = cajas[sel];
  const numero = (etiqueta: string, campo: "x" | "y" | "w" | "h", min: number) => (
    <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
      {etiqueta}
      <Input type="number" value={cajaSel[campo]} min={min} onChange={(e) => cambiar(sel, { [campo]: Number(e.target.value) })} aria-label={`${etiqueta} de la caja`} className="h-8" />
    </label>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && !guardando && alCerrar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Código, tallas y precio · {plantilla.nombre}</DialogTitle>
          <DialogDescription>
            Arrastra cada caja hasta donde va en este diseño y cambia su tamaño con el punto de la esquina. El texto de ejemplo se ve como saldrá en el catálogo.
          </DialogDescription>
        </DialogHeader>
        {nota && <p className="rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/15 dark:text-amber-300">{nota}</p>}

        <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
          <div
            ref={setLienzo}
            className="relative w-full touch-none select-none overflow-hidden rounded-lg border border-border bg-muted"
            style={{ aspectRatio: `${plantilla.ancho} / ${plantilla.alto}` }}
            onPointerMove={alMover}
            onPointerUp={() => (gesto.current = null)}
            onPointerCancel={() => (gesto.current = null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${base}/${plantilla.fondo}.webp`} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" />
            {/* Zapatilla: solo de referencia (se acomoda en el último paso del asistente) */}
            <div
              className="pointer-events-none absolute rounded border border-dashed border-white/60"
              style={{ left: `${(plantilla.zonas.zapatilla.x / plantilla.ancho) * 100}%`, top: `${(plantilla.zonas.zapatilla.y / plantilla.alto) * 100}%`, width: `${(plantilla.zonas.zapatilla.w / plantilla.ancho) * 100}%`, height: `${(plantilla.zonas.zapatilla.h / plantilla.alto) * 100}%` }}
            >
              <span className="absolute left-1 top-1 rounded bg-black/50 px-1 text-[10px] text-white/80">Zapatilla (referencia)</span>
            </div>

            {CAJAS.map(({ clave, nombre, borde, centro }) => {
              const c = cajas[clave];
              const activa = clave === sel;
              const t = texto(clave);
              return (
                <div
                  key={clave}
                  role="button"
                  tabIndex={0}
                  aria-label={`Caja de ${nombre.toLowerCase()}`}
                  aria-pressed={activa}
                  className={cn("absolute cursor-move rounded border-2", borde, activa && "ring-2 ring-white")}
                  style={{ left: `${(c.x / plantilla.ancho) * 100}%`, top: `${(c.y / plantilla.alto) * 100}%`, width: `${(c.w / plantilla.ancho) * 100}%`, height: `${(c.h / plantilla.alto) * 100}%` }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSel(clave);
                    const p = punto(e);
                    gesto.current = { modo: "mover", clave, dx: p.x - c.x, dy: p.y - c.y };
                    lienzo!.setPointerCapture(e.pointerId);
                  }}
                >
                  <div
                    className={cn("pointer-events-none flex h-full w-full flex-col justify-center whitespace-nowrap", centro && "items-center text-center")}
                    style={{ color: c.color, fontFamily: fuente, fontWeight: 900, fontSize: t.px * k, lineHeight: ALTO_LINEA }}
                  >
                    {t.lineas.map((l, i) => (
                      <span key={i}>{l}</span>
                    ))}
                  </div>
                  <span className="pointer-events-none absolute -top-5 left-0 rounded bg-black/70 px-1 text-[10px] leading-4 text-white">{nombre}</span>
                  {activa && (
                    <span
                      className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-full border-2 border-white bg-sky-500"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        gesto.current = { modo: "redimensionar", clave };
                        lienzo!.setPointerCapture(e.pointerId);
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <aside className="space-y-3">
            <div className="flex gap-1.5" role="tablist" aria-label="Caja a ajustar">
              {CAJAS.map(({ clave, nombre }) => (
                <Button key={clave} type="button" size="sm" variant={sel === clave ? "default" : "outline"} onClick={() => setSel(clave)} role="tab" aria-selected={sel === clave}>
                  {nombre}
                </Button>
              ))}
            </div>

            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="grid grid-cols-2 gap-2">
                {numero("X", "x", 0)}
                {numero("Y", "y", 0)}
                {numero("Ancho", "w", 30)}
                {numero("Alto", "h", 16)}
              </div>
              <div className="grid grid-cols-2 items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="caja-color" className="text-[11px] text-muted-foreground">
                    Color del texto
                  </Label>
                  <div className="flex items-center gap-2">
                    <input id="caja-color" type="color" value={cajaSel.color} onChange={(e) => cambiar(sel, { color: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent p-0.5" aria-label="Color del texto" />
                    <span className="font-mono text-xs text-muted-foreground">{cajaSel.color}</span>
                  </div>
                </div>
                <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
                  Letra máx.
                  <Input type="number" min={14} max={240} value={cajaSel.max} onChange={(e) => cambiar(sel, { max: Number(e.target.value) })} aria-label="Tamaño máximo de letra" className="h-8" />
                </label>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">La letra baja de tamaño hasta caber en la caja; «Letra máx.» es el tope.</p>
              <Button type="button" variant="ghost" size="sm" disabled={iguales(cajaSel, guardadas[sel])} onClick={() => setCajas((c) => ({ ...c, [sel]: guardadas[sel] }))}>
                <RotateCcw data-icon="inline-start" /> Volver a lo guardado
              </Button>
            </div>

            <label className="flex items-center gap-2 text-xs text-foreground">
              <Checkbox checked={largo} onCheckedChange={(v) => setLargo(v === true)} />
              Probar con textos largos (código largo, muchas tallas, precio de 4 cifras)
            </label>
            <p className="text-[11px] leading-snug text-muted-foreground">Vale para los catálogos que generes desde ahora con esta plantilla; los ya generados no cambian.</p>
            {mensaje && <p className={mensaje.ok ? "text-xs text-muted-foreground" : "text-sm text-destructive"}>{mensaje.texto}</p>}
          </aside>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={alCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void guardar()} disabled={guardando || !sucia}>
            {guardando ? "Guardando…" : "Guardar posiciones"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
