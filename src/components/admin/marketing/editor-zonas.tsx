"use client";

// Editor de zonas clicables de una página fija (portada, redes…): se dibujan rectángulos sobre la imagen y a cada uno
// se le asigna qué enlace abre (WhatsApp, Instagram, TikTok, Facebook u otra web). Las posiciones son fracciones de
// 0 a 1 del ancho y el alto de la imagen, así valen a cualquier tamaño de pantalla. Los datos reales (número, usuario)
// salen de los enlaces de contacto, no de aquí.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { guardarZonasFija } from "@/lib/actions/marketing-disenos";
import { TIPOS_ENLACE, resolverZona, type Enlaces, type TipoEnlace, type ZonaEnlace } from "@/lib/marketing-catalogo";
import { cn } from "@/lib/utils";

const SELECT =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

type Zona = ZonaEnlace & { id: number };
type Gesto =
  | { modo: "dibujar"; x0: number; y0: number }
  | { modo: "mover"; id: number; dx: number; dy: number }
  | { modo: "redimensionar"; id: number };

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function EditorZonas({
  base,
  pagina,
  enlaces,
  alCerrar,
}: {
  base: string;
  pagina: { id: string; nombre: string; imagen: string; ancho: number; alto: number; zonas: ZonaEnlace[] };
  enlaces: Enlaces;
  alCerrar: () => void;
}) {
  const router = useRouter();
  const contador = useRef(pagina.zonas.length);
  const [zonas, setZonas] = useState<Zona[]>(() => pagina.zonas.map((z, i) => ({ ...z, id: i + 1 })));
  const [sel, setSel] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const lienzo = useRef<HTMLDivElement>(null);
  const gesto = useRef<Gesto | null>(null);

  const punto = (e: React.PointerEvent) => {
    const r = lienzo.current!.getBoundingClientRect();
    return { x: limitar((e.clientX - r.left) / r.width, 0, 1), y: limitar((e.clientY - r.top) / r.height, 0, 1) };
  };
  const cambiar = (id: number, parte: Partial<ZonaEnlace>) => setZonas((zs) => zs.map((z) => (z.id === id ? { ...z, ...parte } : z)));

  function alPresionar(e: React.PointerEvent) {
    if (e.target !== e.currentTarget) return; // sobre una zona lo maneja ella
    const { x, y } = punto(e);
    gesto.current = { modo: "dibujar", x0: x, y0: y };
    setSel(null);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function alMover(e: React.PointerEvent) {
    const g = gesto.current;
    if (!g) return;
    const { x, y } = punto(e);
    if (g.modo === "dibujar") {
      const dibujada = { x: Math.min(g.x0, x), y: Math.min(g.y0, y), w: Math.abs(x - g.x0), h: Math.abs(y - g.y0) };
      setZonas((zs) => {
        const sinTemporal = zs.filter((z) => z.id !== -1);
        return dibujada.w > 0.004 && dibujada.h > 0.004 ? [...sinTemporal, { id: -1, tipo: "whatsapp" as TipoEnlace, ...dibujada }] : sinTemporal;
      });
    } else if (g.modo === "mover") {
      setZonas((zs) => zs.map((z) => (z.id === g.id ? { ...z, x: limitar(x - g.dx, 0, 1 - z.w), y: limitar(y - g.dy, 0, 1 - z.h) } : z)));
    } else {
      setZonas((zs) => zs.map((z) => (z.id === g.id ? { ...z, w: limitar(x - z.x, 0.01, 1 - z.x), h: limitar(y - z.y, 0.01, 1 - z.y) } : z)));
    }
  }
  function alSoltar() {
    const g = gesto.current;
    gesto.current = null;
    if (g?.modo !== "dibujar") return;
    // La zona dibujada deja de ser temporal: recibe su identificador y queda seleccionada.
    const t = zonas.find((z) => z.id === -1);
    if (!t || t.w < 0.01 || t.h < 0.01) {
      setZonas((zs) => zs.filter((z) => z.id !== -1));
      return;
    }
    const id = ++contador.current;
    setZonas((zs) => zs.map((z) => (z.id === -1 ? { ...z, id } : z)));
    setSel(id);
  }

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    const r = await guardarZonasFija(
      pagina.id,
      zonas.map((z) => ({ tipo: z.tipo, x: z.x, y: z.y, w: z.w, h: z.h, ...(z.tipo === "web" ? { url: z.url } : {}) }))
    );
    setGuardando(false);
    setMensaje({ ok: r.success, texto: r.msg });
    if (r.success) {
      router.refresh();
      alCerrar();
    }
  }

  const seleccionada = zonas.find((z) => z.id === sel) ?? null;
  const destino = (z: ZonaEnlace) => resolverZona(z, enlaces)?.url ?? null;

  return (
    <Dialog open onOpenChange={(o) => !o && !guardando && alCerrar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Zonas clicables · {pagina.nombre}</DialogTitle>
          <DialogDescription>
            Arrastra sobre la imagen para dibujar una zona; muévela desde adentro y cambia su tamaño con el punto de la esquina. Cada zona abre el enlace que elijas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
          <div
            ref={lienzo}
            className="relative w-full cursor-crosshair touch-none select-none overflow-hidden rounded-lg border border-border bg-muted"
            style={{ aspectRatio: `${pagina.ancho} / ${pagina.alto}` }}
            onPointerDown={alPresionar}
            onPointerMove={alMover}
            onPointerUp={alSoltar}
            onPointerCancel={alSoltar}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${base}/${pagina.imagen}.webp`} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" />
            {zonas.map((z) => {
              const activa = z.id === sel;
              const sinDato = destino(z) === null;
              return (
                <div
                  key={z.id}
                  className={cn(
                    "absolute cursor-move rounded border-2",
                    activa ? "border-white bg-white/25" : sinDato ? "border-amber-400 bg-amber-400/20" : "border-sky-300 bg-sky-300/20"
                  )}
                  style={{ left: `${z.x * 100}%`, top: `${z.y * 100}%`, width: `${z.w * 100}%`, height: `${z.h * 100}%` }}
                  onPointerDown={(e) => {
                    if (z.id === -1) return;
                    e.stopPropagation();
                    setSel(z.id);
                    const p = punto(e);
                    gesto.current = { modo: "mover", id: z.id, dx: p.x - z.x, dy: p.y - z.y };
                    lienzo.current!.setPointerCapture(e.pointerId);
                  }}
                >
                  <span className="pointer-events-none absolute left-0 top-0 max-w-full truncate rounded-br bg-black/70 px-1 text-[10px] leading-4 text-white">
                    {TIPOS_ENLACE.find((t) => t.id === z.tipo)?.nombre}
                  </span>
                  {activa && (
                    <span
                      className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-full border-2 border-white bg-sky-500"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        gesto.current = { modo: "redimensionar", id: z.id };
                        lienzo.current!.setPointerCapture(e.pointerId);
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <aside className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {zonas.filter((z) => z.id !== -1).length} zona(s). En amarillo, las que aún no tienen el dato de contacto configurado: no llevarán enlace.
            </p>
            {seleccionada ? (
              <div className="space-y-2.5 rounded-lg border border-border p-3">
                <label className="block space-y-1 text-xs font-medium text-foreground">
                  Abre
                  <select className={SELECT} value={seleccionada.tipo} onChange={(e) => cambiar(seleccionada.id, { tipo: e.target.value as TipoEnlace })}>
                    {TIPOS_ENLACE.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                {seleccionada.tipo === "web" && (
                  <label className="block space-y-1 text-xs font-medium text-foreground">
                    Dirección (https://…)
                    <Input value={seleccionada.url ?? ""} onChange={(e) => cambiar(seleccionada.id, { url: e.target.value })} placeholder="https://" maxLength={300} />
                  </label>
                )}
                <p className="break-all text-[11px] text-muted-foreground">
                  {destino(seleccionada) ? `→ ${destino(seleccionada)}` : "Sin enlace: falta configurar este dato en «Enlaces de contacto»."}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={() => { setZonas((zs) => zs.filter((z) => z.id !== seleccionada.id)); setSel(null); }}>
                  <Trash2 data-icon="inline-start" /> Quitar zona
                </Button>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">Toca una zona para elegir a dónde lleva, o dibuja una nueva.</p>
            )}
            {mensaje && !mensaje.ok && <p className="text-sm text-destructive">{mensaje.texto}</p>}
            <Button className="w-full" onClick={() => void guardar()} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar zonas"}
            </Button>
            <p className="text-[11px] text-muted-foreground">Los catálogos toman las zonas al publicarse; los ya publicados no cambian.</p>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
