"use client";

// Visor de catálogos: el ÚNICO renderer de una página (lo compartirán el editor
// y el PDF). Cada página es HTML sobre un lienzo de "px de diseño" (el ancho de
// la plantilla) que la pantalla solo escala con transform. Porte del visor de la
// prueba (PruebaCatalogo/web/visor.js), medido con 1000 páginas:
//  - virtualización: existen todas las cajas, pero solo se dibujan las cercanas
//    a la pantalla y se vacían al alejarse;
//  - imagen WebP de 600 o 1200 px según tamaño en pantalla × densidad;
//  - textos que bajan de tamaño hasta caber en su zona; las tallas se parten en líneas.
import { createContext, memo, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Ajuste, PaginaCat, PlantillaSnap, ProductoCat, Snapshot, Zona } from "@/lib/marketing-catalogo";

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
const VisorCtx = createContext<Ctx | null>(null);

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

function urlZapatilla(base: string, p: ProductoCat, necesario: number): string {
  const ancho = necesario > 700 ? 1200 : 600;
  return `${base}/derivados/w${ancho}/${encodeURIComponent(p.cod)}.v${p.v}.webp`;
}

function ContenidoPagina({ i, pag, prod, pl }: { i: number; pag: PaginaCat; prod: ProductoCat; pl: PlantillaSnap }) {
  const c = useContext(VisorCtx)!;
  if (c.ancho === 0) return null; // aún no se midió el ancho de la pantalla
  const k = c.ancho / pl.ancho;
  const z = pl.zonas;
  const t = c.textos(prod, pl, pag.plantilla);
  const a = pag.ajuste ?? IDENTIDAD;
  const necesario = z.zapatilla.w * k * c.dpr;

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
        className="absolute select-none"
        style={{
          left: z.zapatilla.x,
          top: z.zapatilla.y,
          width: z.zapatilla.w,
          height: z.zapatilla.h,
          transform: `translate(${a.dx}px, ${a.dy}px) scale(${a.s})`,
          transformOrigin: "50% 50%",
        }}
      />
      {txt(z.codigo, t.codigo)}
      {txt(z.tallas, t.tallas)}
      {txt(z.precio, t.precio, true)}
      <div className="absolute bottom-1.5 right-2 rounded-full bg-black/40 px-1.5 text-[11px] text-white/60">
        {i + 1} / {c.total}
      </div>
    </div>
  );
}

const PaginaShell = memo(function PaginaShell({ i, pag, prod, pl }: { i: number; pag: PaginaCat; prod: ProductoCat; pl: PlantillaSnap }) {
  const ref = useRef<HTMLElement>(null);
  const cerca = useCerca(ref);
  return (
    <section
      ref={ref}
      className="relative w-full overflow-hidden rounded bg-[#2a2d35]"
      style={{ aspectRatio: `${pl.ancho} / ${pl.alto}` }}
      aria-label={`Página ${i + 1}: ${prod.modelo}`}
    >
      {cerca && <ContenidoPagina i={i} pag={pag} prod={prod} pl={pl} />}
    </section>
  );
});

// ---------- visor ----------
export function VisorCatalogo({ snapshot, fuente }: { snapshot: Snapshot; fuente: string }) {
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
      base: snapshot.imagenes_base,
      fuente,
      total: snapshot.paginas.length,
      textos: (prod, pl, plId) => {
        const clave = `${fuenteLista}|${plId}|${prod.cod}`;
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
    [ancho, dpr, fuenteLista, fuente, snapshot, util]
  );

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
              <PaginaShell key={pag.id} i={i} pag={pag} prod={snapshot.productos[pag.prod]} pl={snapshot.plantillas[pag.plantilla]} />
            ))}
          </VisorCtx.Provider>
        </div>
      </main>
    </div>
  );
}
