"use client";

// Renderer de catálogos: el ÚNICO que dibuja una página (lo usan el visor
// público, el editor y, más adelante, el PDF). Cada página es HTML sobre un
// lienzo de "px de diseño" (el ancho de la plantilla) que la pantalla solo
// escala con transform. Porte del visor de la prueba (PruebaCatalogo/web/visor.js),
// medido con 1000 páginas:
//  - virtualización: existen todas las cajas, pero solo se dibujan las cercanas
//    a la pantalla y se vacían al alejarse;
//  - imagen WebP de 600 o 1200 px según tamaño en pantalla × densidad;
//  - textos que bajan de tamaño hasta caber en su zona; las tallas se parten en líneas.
// El modo `editable` (solo el editor) añade selección y arrastre de la zapatilla.
import { createContext, memo, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  Ajuste,
  PaginaCat,
  PaginaFija,
  PaginaProducto,
  PlantillaSnap,
  ProductoCat,
  Snapshot,
  Zona,
} from "@/lib/marketing-catalogo";
import { cn } from "@/lib/utils";

const ANCHO_MAX = 1400;

// ---------- medida y ajuste de texto ----------
type Medir = (texto: string, px: number) => number;

// Devuelve el tamaño más grande (≤ zona.max) en que el texto entra en la zona,
// partiéndolo en líneas por los separadores cuando hace falta.
function ajustar(partes: string[], zona: Zona, sep: string, medir: Medir): { px: number; lineas: string[] } {
  for (let px = zona.max ?? 40; px >= 14; px -= 2) {
    const lineas: string[] = [];
    let actual = "";
    for (const p of partes) {
      const prueba = actual ? actual + sep + p : p;
      if (medir(prueba, px) <= zona.w || !actual) actual = prueba;
      else {
        lineas.push(actual);
        actual = p;
      }
    }
    if (actual) lineas.push(actual);
    if (lineas.every((l) => medir(l, px) <= zona.w) && lineas.length * px * 1.12 <= zona.h) return { px, lineas };
  }
  return { px: 14, lineas: [partes.join(sep)] };
}

type TextoAjustado = { px: number; lineas: string[] };
type Textos = { codigo: TextoAjustado; tallas: TextoAjustado; precio: TextoAjustado };

// ---------- contexto compartido por todas las páginas ----------
type Ctx = {
  /** Ancho en px CSS de cada página. */
  ancho: number;
  dpr: number;
  base: string;
  fuente: string;
  total: number;
  textos: (prod: ProductoCat, pl: PlantillaSnap, plId: string) => Textos;
};
export const VisorCtx = createContext<Ctx | null>(null);

// ---------- un solo IntersectionObserver para todas las páginas ----------
let observador: IntersectionObserver | null = null;
const avisos = new WeakMap<Element, (cerca: boolean) => void>();
function obtenerObservador() {
  observador ??= new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) avisos.get(e.target)?.(e.isIntersecting);
    },
    { rootMargin: "150% 0px" }
  );
  return observador;
}
function useCerca(ref: React.RefObject<HTMLElement | null>): boolean {
  const [cerca, setCerca] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const o = obtenerObservador();
    avisos.set(el, setCerca);
    o.observe(el);
    return () => {
      o.unobserve(el);
      avisos.delete(el);
    };
  }, [ref]);
  return cerca;
}

// ---------- una página ----------
const IDENTIDAD: Ajuste = { dx: 0, dy: 0, s: 1 };

export function transformacion(a: Ajuste): string {
  return `translate(${a.dx}px, ${a.dy}px) scale(${a.s})`;
}

function urlZapatilla(base: string, p: ProductoCat, necesario: number): string {
  const ancho = necesario > 700 ? 1200 : 600;
  return `${base}/derivados/w${ancho}/${encodeURIComponent(p.cod)}.v${p.v}.webp`;
}

type Edicion = {
  editable: boolean;
  alSeleccionar: (id: string) => void;
  alAjustar: (id: string, a: Ajuste) => void;
};

function ContenidoProducto({
  i,
  pag,
  prod,
  pl,
  edicion,
}: {
  i: number;
  pag: PaginaProducto;
  prod: ProductoCat;
  pl: PlantillaSnap;
  edicion?: Edicion;
}) {
  const c = useContext(VisorCtx)!;
  const arrastre = useRef<{ x: number; y: number; a: Ajuste; el: HTMLImageElement; ultimo?: Ajuste } | null>(null);
  if (c.ancho === 0) return null; // aún no se midió el ancho de la pantalla
  const k = c.ancho / pl.ancho;
  const z = pl.zonas;
  const t = c.textos(prod, pl, pag.plantilla);
  const a = pag.ajuste ?? IDENTIDAD;
  const necesario = z.zapatilla.w * k * c.dpr;
  const editable = edicion?.editable ?? false;

  const txt = (zona: Zona, r: TextoAjustado, centro?: boolean) => (
    <div
      className={"absolute flex flex-col justify-center whitespace-nowrap leading-[1.12]" + (centro ? " items-center text-center" : "")}
      style={{ left: zona.x, top: zona.y, width: zona.w, height: zona.h, color: zona.color, fontSize: r.px, fontFamily: c.fuente, fontWeight: 900 }}
    >
      {r.lineas.map((l, j) => (
        <span key={j}>{l}</span>
      ))}
    </div>
  );

  return (
    <div className="absolute left-0 top-0 origin-top-left" style={{ width: pl.ancho, height: pl.alto, transform: `scale(${k})` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${c.base}/${pl.fondo}.webp`} alt="" decoding="async" className="absolute inset-0 select-none" style={{ width: pl.ancho, height: pl.alto }} draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={urlZapatilla(c.base, prod, necesario)}
        alt={prod.modelo}
        decoding="async"
        draggable={false}
        className={cn("absolute select-none", editable && "cursor-grab touch-none active:cursor-grabbing")}
        style={{
          left: z.zapatilla.x,
          top: z.zapatilla.y,
          width: z.zapatilla.w,
          height: z.zapatilla.h,
          transform: transformacion(a),
          transformOrigin: "50% 50%",
        }}
        // Arrastre: se mueve la imagen directamente (sin re-render por cada píxel) y
        // al soltar se guarda el ajuste final, en px de diseño.
        onPointerDown={
          editable
            ? (e) => {
                e.preventDefault();
                edicion!.alSeleccionar(pag.id);
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  // Sin captura el arrastre igual funciona mientras el puntero siga sobre la imagen.
                }
                arrastre.current = { x: e.clientX, y: e.clientY, a, el: e.currentTarget };
              }
            : undefined
        }
        onPointerMove={
          editable
            ? (e) => {
                const s = arrastre.current;
                if (!s) return;
                const n = { ...s.a, dx: Math.round(s.a.dx + (e.clientX - s.x) / k), dy: Math.round(s.a.dy + (e.clientY - s.y) / k) };
                s.el.style.transform = transformacion(n);
                s.ultimo = n;
              }
            : undefined
        }
        onPointerUp={
          editable
            ? () => {
                const s = arrastre.current;
                arrastre.current = null;
                if (s?.ultimo) edicion!.alAjustar(pag.id, s.ultimo);
              }
            : undefined
        }
        onPointerCancel={editable ? () => (arrastre.current = null) : undefined}
      />
      {txt(z.codigo, t.codigo)}
      {txt(z.tallas, t.tallas, true)}
      {txt(z.precio, t.precio, true)}
      <div className="absolute bottom-1.5 right-2 rounded-full bg-black/40 px-1.5 text-[11px] text-white/60">
        {i + 1} / {c.total}
        {prod.genero ? ` · ${prod.genero}` : ""}
      </div>
    </div>
  );
}

function ContenidoFija({ i, pag }: { i: number; pag: PaginaFija }) {
  const c = useContext(VisorCtx)!;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${c.base}/${pag.imagen}.webp`} alt="" decoding="async" draggable={false} className="absolute inset-0 h-full w-full select-none object-contain" />
      <div className="absolute bottom-1.5 right-2 rounded-full bg-black/40 px-1.5 text-[11px] text-white/60">
        {i + 1} / {c.total}
      </div>
    </>
  );
}

export const PaginaShell = memo(function PaginaShell({
  i,
  pag,
  prod,
  pl,
  editable,
  seleccionada,
  alSeleccionar,
  alAjustar,
}: {
  i: number;
  pag: PaginaCat;
  prod?: ProductoCat;
  pl?: PlantillaSnap;
  editable?: boolean;
  seleccionada?: boolean;
  alSeleccionar?: (id: string) => void;
  alAjustar?: (id: string, a: Ajuste) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const cerca = useCerca(ref);
  const edicion: Edicion | undefined =
    editable && alSeleccionar && alAjustar ? { editable: true, alSeleccionar, alAjustar } : undefined;

  const proporcion = pag.tipo === "fija" ? `${pag.ancho} / ${pag.alto}` : pl ? `${pl.ancho} / ${pl.alto}` : "2000 / 1141";
  const etiqueta = pag.tipo === "fija" ? "Página con imagen" : `${prod?.modelo ?? ""}${prod?.genero ? ` (${prod.genero})` : ""}`;

  return (
    <section
      ref={ref}
      id={`pag-${pag.id}`}
      className={cn(
        "relative w-full overflow-hidden rounded bg-[#2a2d35]",
        editable && "cursor-pointer",
        seleccionada && "outline outline-[3px] outline-offset-2 outline-[#2f6fed]"
      )}
      style={{ aspectRatio: proporcion }}
      aria-label={`Página ${i + 1}: ${etiqueta}`}
      onPointerDown={editable && alSeleccionar ? () => alSeleccionar(pag.id) : undefined}
    >
      {cerca &&
        (pag.tipo === "fija" ? (
          <ContenidoFija i={i} pag={pag} />
        ) : prod && pl ? (
          <ContenidoProducto i={i} pag={pag} prod={prod} pl={pl} edicion={edicion} />
        ) : null)}
    </section>
  );
});

/**
 * Prepara el contexto que comparten las páginas (ancho real, densidad de
 * pantalla, medida de textos con la tipografía cargada). Lo usan el visor
 * público y el editor.
 */
export function useContextoVisor(base: string, fuente: string, total: number) {
  const listaRef = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  const [dpr, setDpr] = useState(1);
  const [fuenteLista, setFuenteLista] = useState(false);

  // Ancho real de las páginas (la escala depende de él).
  useEffect(() => {
    const el = listaRef.current;
    if (!el) return;
    setDpr(window.devicePixelRatio || 1);
    setAncho(el.clientWidth);
    let t: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => setAncho(el.clientWidth), 100);
    });
    ro.observe(el);
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, []);

  // No se espera a la tipografía para dibujar: cuando llega, se re-miden los textos.
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

  // El canvas de medida se crea al primer uso: este componente también se
  // renderiza en el servidor, donde no existe `document`.
  const util = useMemo(() => {
    let g: CanvasRenderingContext2D | null = null;
    const medir: Medir = (texto, px) => {
      g ??= document.createElement("canvas").getContext("2d")!;
      g.font = `900 ${px}px ${fuente}`;
      return g.measureText(texto).width;
    };
    return { medir, cache: new Map<string, Textos>() };
  }, [fuente]);

  const valor = useMemo<Ctx>(
    () => ({
      ancho,
      dpr,
      base,
      fuente,
      total,
      textos: (prod, pl, plId) => {
        // La clave incluye lo que cambia el texto: así un cambio de datos no deja medidas viejas.
        const clave = `${fuenteLista}|${plId}|${prod.cod}|${prod.genero ?? ""}|${prod.tallas.join(",")}|${prod.precio}`;
        let r = util.cache.get(clave);
        if (!r) {
          r = {
            codigo: ajustar([prod.cod], pl.zonas.codigo, "", util.medir),
            tallas: ajustar(prod.tallas.length ? prod.tallas : ["—"], pl.zonas.tallas, " · ", util.medir),
            precio: ajustar([`S/ ${Number(prod.precio).toFixed(2)}`], pl.zonas.precio, "", util.medir),
          };
          util.cache.set(clave, r);
        }
        return r;
      },
    }),
    [ancho, dpr, fuenteLista, fuente, base, total, util]
  );

  return { listaRef, valor };
}

// ---------- visor público ----------
export function VisorCatalogo({ snapshot, fuente }: { snapshot: Snapshot; fuente: string }) {
  const { listaRef, valor } = useContextoVisor(snapshot.imagenes_base, fuente, snapshot.paginas.length);

  return (
    <div className="min-h-screen bg-[#16181d] text-[#e8e8e8]">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#2a2d35] bg-[#0e0f12]/90 px-4 py-2.5 backdrop-blur">
        <h1 className="text-[15px] font-semibold">{snapshot.titulo}</h1>
        <span className="text-xs text-[#9aa0ab]">{snapshot.paginas.length.toLocaleString("en-US")} páginas</span>
      </header>
      <main className="mx-auto p-4" style={{ maxWidth: ANCHO_MAX + 32 }}>
        <div ref={listaRef} className="flex flex-col gap-3.5">
          <VisorCtx.Provider value={valor}>
            {snapshot.paginas.map((pag, i) => (
              <PaginaShell
                key={pag.id}
                i={i}
                pag={pag}
                prod={pag.tipo === "producto" ? snapshot.productos[pag.prod] : undefined}
                pl={pag.tipo === "producto" ? snapshot.plantillas[pag.plantilla] : undefined}
              />
            ))}
          </VisorCtx.Provider>
        </div>
      </main>
    </div>
  );
}

export { ANCHO_MAX };
