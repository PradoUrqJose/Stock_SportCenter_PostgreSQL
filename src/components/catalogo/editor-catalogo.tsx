"use client";

// Editor de catálogos para Marketing. Trabaja sobre el BORRADOR: los clientes
// solo ven los cambios cuando se pulsa «Publicar» (el mismo enlace pasa a
// mostrar la versión nueva). Dibuja con el mismo renderer que el visor público.
//
//  - Mover/agrandar la zapatilla de cada página (arrastrar, flechas, +/−).
//  - Quitar páginas (se pueden restaurar), reordenar y agregar páginas con imagen.
//  - Reemplazar la imagen de un producto (se sube a R2 y queda en Neon).
//  - Deshacer/rehacer y guardado automático por lotes (1 s sin cambios): nunca
//    un guardado por arrastre, para no agotar las conexiones de la base.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Eye,
  ImagePlus,
  Minus,
  Plus,
  ImageOff,
  LayoutList,
  Redo2,
  RefreshCw,
  Replace,
  RotateCcw,
  Trash2,
  Undo2,
  Undo,
  X,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EnlaceCatalogo } from "@/components/admin/marketing/acciones-catalogo";
import { ReemplazarImagen } from "@/components/admin/marketing/reemplazar-imagen";
import { cambiarEscalaTalla, guardarEdicion, publicarCatalogo } from "@/lib/actions/marketing-catalogos";
import { enviarPaginaFija, prepararPaginaFija } from "@/lib/subir-imagen-cliente";
import type { Ajuste, FijaBiblioteca, PaginaCat, PaginaFija, PlantillaSnap, ProductoCat, ResumenSincronizacion } from "@/lib/marketing-catalogo";
import { fechaStock } from "@/lib/marketing-sincronizar";
import type { EscalaTalla } from "@/lib/marketing-tallas";
import { cn } from "@/lib/utils";
import { BotonPdf } from "./boton-pdf";
import { OrdenarCatalogo } from "./ordenar-catalogo";
import { quitarPagina } from "./ordenar-catalogo-logica";
import { ANCHO_MAX, PaginaShell, VisorCtx, useContextoVisor } from "./visor-catalogo";

type Estado = { paginas: PaginaCat[]; quitadas: PaginaCat[] };
type Historial = { e: Estado; pasado: Estado[]; futuro: Estado[] };
type Accion = { t: "cambiar"; f: (e: Estado) => Estado } | { t: "deshacer" } | { t: "rehacer" };

const MAX_HISTORIAL = 100;

function reductor(s: Historial, a: Accion): Historial {
  if (a.t === "cambiar") {
    const n = a.f(s.e);
    return n === s.e ? s : { e: n, pasado: [...s.pasado.slice(-(MAX_HISTORIAL - 1)), s.e], futuro: [] };
  }
  if (a.t === "deshacer") {
    if (s.pasado.length === 0) return s;
    return { e: s.pasado[s.pasado.length - 1], pasado: s.pasado.slice(0, -1), futuro: [s.e, ...s.futuro] };
  }
  if (s.futuro.length === 0) return s;
  return { e: s.futuro[0], pasado: [...s.pasado, s.e], futuro: s.futuro.slice(1) };
}

// ---------- operaciones puras sobre las páginas ----------
const esNeutro = (a: Ajuste) => a.dx === 0 && a.dy === 0 && a.s === 1;

function conAjuste(e: Estado, id: string, a: Ajuste): Estado {
  return {
    ...e,
    paginas: e.paginas.map((p) => {
      if (p.id !== id || p.tipo !== "producto") return p;
      if (esNeutro(a)) {
        const { ajuste: _descartado, ...resto } = p;
        void _descartado;
        return resto;
      }
      return { ...p, ajuste: a };
    }),
  };
}

/** Ajusta una página partiendo de su ajuste ACTUAL en el estado (no de una copia vieja de la pantalla). */
function ajustarRelativo(e: Estado, id: string, f: (a: Ajuste) => Ajuste): Estado {
  const p = e.paginas.find((x) => x.id === id);
  if (!p || p.tipo !== "producto") return e;
  return conAjuste(e, id, f(p.ajuste ?? { dx: 0, dy: 0, s: 1 }));
}

function moverA(e: Estado, id: string, destino: number): Estado {
  const origen = e.paginas.findIndex((p) => p.id === id);
  const d = Math.max(0, Math.min(e.paginas.length - 1, destino));
  if (origen < 0 || origen === d) return e;
  const paginas = [...e.paginas];
  const [p] = paginas.splice(origen, 1);
  paginas.splice(d, 0, p);
  return { ...e, paginas };
}

function quitar(e: Estado, id: string): Estado {
  if (!e.paginas.some((p) => p.id === id)) return e;
  return quitarPagina(e.paginas, e.quitadas, id);
}

function restaurar(e: Estado, id: string, posicion: number): Estado {
  const p = e.quitadas.find((x) => x.id === id);
  if (!p) return e;
  const paginas = [...e.paginas];
  paginas.splice(Math.max(0, Math.min(paginas.length, posicion)), 0, p);
  return { paginas, quitadas: e.quitadas.filter((x) => x.id !== id) };
}

const nuevoId = (prefijo: string) => `${prefijo}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------- componente ----------
type Props = {
  id: string;
  titulo: string;
  base: string;
  fuente: string;
  plantillas: Record<string, PlantillaSnap>;
  productosIniciales: ProductoCat[];
  paginasIniciales: PaginaCat[];
  quitadasIniciales: PaginaCat[];
  /** Versión que se está editando (null = borrador inicial de un catálogo sin publicar). */
  versionBase: number | null;
  /** Versión que hoy ven los clientes en el enlace. */
  versionVigente: number | null;
  sinPublicarInicial: boolean;
  enlacesIniciales: { principal: string; alterno: string } | null;
  /** Aviso al llegar (ej. «Versión 5 publicada»), cuando se viene de publicar desde el detalle. */
  mensajeInicial?: string;
  /** Páginas fijas de Marketing (portadas, separadores, términos…) para agregar con un clic. */
  biblioteca: FijaBiblioteca[];
  /** Cuándo se consultó el ERP por última vez para los datos de este borrador (ISO). */
  stockAl?: string | null;
  /** Última sincronización con el ERP que se aplicó a este borrador. */
  sincronizacion?: ResumenSincronizacion | null;
  /** Escala de las tallas que se muestran (las del ERP son USA; la peruana sale de las equivalencias). */
  escalaTalla: EscalaTalla;
  /** Marcas y géneros de este catálogo que salen con talla USA por no tener equivalencia (frases ya armadas). */
  avisosTallas: string[];
};

export function EditorCatalogo({
  id,
  titulo,
  base,
  fuente,
  plantillas,
  productosIniciales,
  paginasIniciales,
  quitadasIniciales,
  versionBase,
  versionVigente,
  sinPublicarInicial,
  enlacesIniciales,
  mensajeInicial,
  biblioteca,
  stockAl,
  sincronizacion,
  escalaTalla,
  avisosTallas,
}: Props) {
  const router = useRouter();
  // Estado de partida (estable): sirve también para saber si el usuario ya cambió algo.
  const [inicial] = useState<Estado>(() => ({ paginas: paginasIniciales, quitadas: quitadasIniciales }));
  const [{ e, pasado, futuro }, despachar] = useReducer(reductor, { e: inicial, pasado: [], futuro: [] });
  const { paginas, quitadas } = e;
  const [productos, setProductos] = useState(productosIniciales);
  const [sel, setSel] = useState<string | null>(null);
  // Lo guardado se deduce comparando con el último estado que llegó a la base de datos.
  const [guardadoDe, setGuardadoDe] = useState<Estado>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState(false);
  const [sinPublicar, setSinPublicar] = useState(sinPublicarInicial);
  const enlaces = enlacesIniciales;
  const [publicando, setPublicando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(
    mensajeInicial ? { ok: true, texto: mensajeInicial } : null
  );
  const [dialogo, setDialogo] = useState<"quitadas" | "agregar" | "reemplazar" | "sinimagen" | null>(null);
  const [ordenando, setOrdenando] = useState(false);
  const [irA, setIrA] = useState("");

  const { listaRef, valor } = useContextoVisor(base, fuente, paginas.length);

  const indice = sel ? paginas.findIndex((p) => p.id === sel) : -1;
  const paginaSel = indice >= 0 ? paginas[indice] : null;
  const productoSel = paginaSel?.tipo === "producto" ? productos[paginaSel.prod] : null;

  const cambiar = useCallback((f: (e: Estado) => Estado) => {
    setSinPublicar(true);
    despachar({ t: "cambiar", f });
  }, []);
  const deshacer = useCallback(() => {
    setSinPublicar(true);
    despachar({ t: "deshacer" });
  }, []);
  const rehacer = useCallback(() => {
    setSinPublicar(true);
    despachar({ t: "rehacer" });
  }, []);
  const alSeleccionar = useCallback((pid: string) => setSel(pid), []);
  const alAjustar = useCallback((pid: string, a: Ajuste) => cambiar((x) => conAjuste(x, pid, a)), [cambiar]);

  const irAPagina = useCallback((pid: string) => {
    requestAnimationFrame(() => document.getElementById(`pag-${pid}`)?.scrollIntoView({ block: "center" }));
  }, []);

  // ----- guardado automático por lotes -----
  const ultimo = useRef(e);
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cola = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    ultimo.current = e;
  }, [e]);

  // Guarda el último estado. Las llamadas se encolan (nunca dos guardados a la vez);
  // devuelve si ese guardado terminó bien.
  const guardarUltimo = useCallback((): Promise<boolean> => {
    const turno = cola.current.then(async () => {
      const enviado = ultimo.current;
      setGuardando(true);
      const r = await guardarEdicion(id, versionBase, { paginas: enviado.paginas, quitadas: enviado.quitadas });
      setGuardando(false);
      if (r.success) {
        setGuardadoDe(enviado);
        setErrorGuardado(false);
      } else {
        setErrorGuardado(true);
        setMensaje({ ok: false, texto: `No se pudo guardar: ${r.msg}` });
      }
      return r.success;
    });
    cola.current = turno.then(() => undefined);
    return turno;
  }, [id, versionBase]);

  // Cada cambio programa un guardado 1 s después del último (por lotes, no uno por arrastre).
  useEffect(() => {
    if (e === guardadoDe) return;
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => void guardarUltimo(), 1000);
    return () => clearTimeout(temporizador.current);
  }, [e, guardadoDe, guardarUltimo]);

  // Avisa antes de cerrar la pestaña con cambios sin guardar.
  useEffect(() => {
    const h = (ev: BeforeUnloadEvent) => {
      if (e !== guardadoDe || guardando || errorGuardado) ev.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [e, guardadoDe, guardando, errorGuardado]);

  // ----- acciones sobre la página seleccionada -----
  const ajusteSel = useMemo<Ajuste>(
    () => (paginaSel?.tipo === "producto" && paginaSel.ajuste) || { dx: 0, dy: 0, s: 1 },
    [paginaSel]
  );
  const idSel = paginaSel?.tipo === "producto" ? paginaSel.id : null;
  const escalar = useCallback(
    (factor: number) => {
      if (!idSel) return;
      cambiar((x) =>
        ajustarRelativo(x, idSel, (a) => ({ ...a, s: Math.max(0.2, Math.min(5, Math.round(a.s * factor * 1000) / 1000)) }))
      );
    },
    [idSel, cambiar]
  );
  const desplazar = useCallback(
    (dx: number, dy: number) => {
      if (!idSel) return;
      cambiar((x) => ajustarRelativo(x, idSel, (a) => ({ ...a, dx: a.dx + dx, dy: a.dy + dy })));
    },
    [idSel, cambiar]
  );
  const restablecer = () => paginaSel?.tipo === "producto" && alAjustar(paginaSel.id, { dx: 0, dy: 0, s: 1 });

  const quitarSel = () => {
    if (!paginaSel) return;
    const vecina = paginas[indice + 1] ?? paginas[indice - 1];
    cambiar((x) => quitar(x, paginaSel.id));
    setSel(vecina?.id ?? null);
  };
  const mover = (delta: number) => {
    if (!paginaSel) return;
    cambiar((x) => moverA(x, paginaSel.id, indice + delta));
    irAPagina(paginaSel.id);
  };
  const irAPosicion = () => {
    const n = parseInt(irA, 10);
    if (!paginaSel || !Number.isFinite(n)) return;
    cambiar((x) => moverA(x, paginaSel.id, n - 1));
    setIrA("");
    irAPagina(paginaSel.id);
  };

  // ----- teclado -----
  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (document.querySelector("[role=dialog]")) return;
      const cmd = ev.metaKey || ev.ctrlKey;
      if (cmd && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        if (ev.shiftKey) rehacer();
        else deshacer();
        return;
      }
      if (!paginaSel || paginaSel.tipo !== "producto") return;
      const paso = ev.shiftKey ? 20 : 4;
      const mov: Record<string, [number, number]> = {
        ArrowLeft: [-paso, 0],
        ArrowRight: [paso, 0],
        ArrowUp: [0, -paso],
        ArrowDown: [0, paso],
      };
      if (mov[ev.key]) {
        ev.preventDefault();
        desplazar(...mov[ev.key]);
      } else if (ev.key === "+" || ev.key === "=") escalar(1.03);
      else if (ev.key === "-") escalar(1 / 1.03);
      else if (ev.key === "0") restablecer();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  });

  // ----- publicar -----
  async function publicar() {
    setPublicando(true);
    setMensaje(null);
    clearTimeout(temporizador.current);
    if (!(await guardarUltimo())) {
      setPublicando(false);
      setMensaje({ ok: false, texto: "No se publicó: los cambios no se pudieron guardar. Reintenta." });
      return;
    }
    const r = await publicarCatalogo(id, versionBase);
    if (r.success && r.data) {
      // La versión nueva pasa a ser la que se edita; la de partida vuelve a verse como se publicó.
      router.replace(`/admin/marketing/catalogos/${id}/editar?version=${r.data.version}&publicado=${r.data.version}${r.data.sinImagen > 0 ? `&sinimagen=${r.data.sinImagen}` : ""}${r.data.conTallaUsa > 0 ? `&tallasusa=${r.data.conTallaUsa}` : ""}`);
    } else {
      setPublicando(false);
      setMensaje({ ok: false, texto: r.msg });
    }
  }

  // Sincronizar con el ERP: primero se guarda lo que haya y luego se abre la pantalla de la consulta.
  const [yendoASincronizar, setYendoASincronizar] = useState(false);
  async function sincronizar() {
    setYendoASincronizar(true);
    setMensaje(null);
    clearTimeout(temporizador.current);
    if (!(await guardarUltimo())) {
      setYendoASincronizar(false);
      setMensaje({ ok: false, texto: "No se pudo guardar lo que llevas editado; reintenta antes de sincronizar." });
      return;
    }
    router.push(`/admin/marketing/catalogos/${id}/sincronizar${versionBase === null ? "" : `?version=${versionBase}`}`);
  }
  // Páginas cuyo producto aún no tiene imagen en R2 (versión 0): salen con la zapatilla vacía hasta que se les sube una.
  const sinImagen = useMemo(
    () => paginas.flatMap((p, i) => (p.tipo === "producto" && productos[p.prod]?.v === 0 ? [{ id: p.id, numero: i + 1, prod: productos[p.prod] }] : [])),
    [paginas, productos]
  );
  const codigosSinImagen = useMemo(() => new Set(sinImagen.map((x) => x.prod.cod)).size, [sinImagen]);
  // Cambiar la escala de tallas: se guarda lo editado, se cambia en el catálogo y la página se vuelve a armar con la escala nueva.
  const [cambiandoEscala, setCambiandoEscala] = useState(false);
  async function elegirEscala(nueva: EscalaTalla) {
    if (nueva === escalaTalla || cambiandoEscala) return;
    setCambiandoEscala(true);
    setMensaje(null);
    clearTimeout(temporizador.current);
    if (!(await guardarUltimo())) {
      setCambiandoEscala(false);
      setMensaje({ ok: false, texto: "No se pudo guardar lo que llevas editado; reintenta antes de cambiar las tallas." });
      return;
    }
    const r = await cambiarEscalaTalla(id, nueva);
    if (!r.success) {
      setCambiandoEscala(false);
      setMensaje({ ok: false, texto: r.msg });
      return;
    }
    router.refresh();
  }
  // Productos que la sincronización quitó por falta de stock y siguen sin restaurarse.
  const quitadosPorStock = useMemo(() => quitadas.filter((q) => q.tipo === "producto" && q.motivo === "sync").length, [quitadas]);

  const estadoTexto = guardando
    ? "Guardando…"
    : errorGuardado
      ? "Error al guardar"
      : e !== guardadoDe
        ? "Cambios sin guardar…"
        : "Guardado ✓";

  const cantidadTexto = useMemo(
    () => `${paginas.length.toLocaleString("en-US")} páginas${quitadas.length ? ` · ${quitadas.length} quitadas` : ""}`,
    [paginas.length, quitadas.length]
  );

  return (
    // Pantalla completa y oscura, como el enlace de los clientes. La clase `dark` hace que los
    // botones y campos usen su aspecto oscuro; la tipografía del diseño (Montserrat Black) llega por
    // herencia desde la página y aquí se vuelve a la de la interfaz (los textos de cada página la piden por su cuenta).
    <div className="dark min-h-screen bg-[#16181d] font-sans font-normal text-[#e8e8e8]">
      <header className="sticky top-0 z-20 border-b border-[#2a2d35] bg-[#0e0f12]/90 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
          <Link
            href={`/admin/marketing/catalogos/${id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
            title="Volver al catálogo y sus versiones"
          >
            <ArrowLeft data-icon="inline-start" /> Catálogo y versiones
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold">{titulo}</h1>
            <p className="text-xs text-[#9aa0ab]">
              {cantidadTexto} · <span className={cn(errorGuardado && "text-red-400")}>{estadoTexto}</span>
              {errorGuardado && (
                <button type="button" className="ml-1 underline" onClick={() => void guardarUltimo()}>
                  reintentar
                </button>
              )}
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              versionBase === null || (versionBase !== versionVigente && !sinPublicar)
                ? "bg-white/10 text-[#9aa0ab]"
                : sinPublicar
                  ? "bg-amber-500/15 text-amber-400"
                  : "bg-green-500/15 text-green-400"
            )}
            title={versionVigente ? `Los clientes ven la v${versionVigente}` : undefined}
          >
            {versionBase === null
              ? "Sin publicar"
              : sinPublicar
                ? `Editando v${versionBase} · cambios sin publicar`
                : versionBase === versionVigente
                  ? `v${versionBase} · vigente`
                  : `v${versionBase} · versión anterior`}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button variant="outline" size="icon" aria-label="Deshacer" title="Deshacer (⌘Z)" disabled={pasado.length === 0} onClick={deshacer}>
              <Undo2 />
            </Button>
            <Button variant="outline" size="icon" aria-label="Rehacer" title="Rehacer (⇧⌘Z)" disabled={futuro.length === 0} onClick={rehacer}>
              <Redo2 />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDialogo("agregar")}>
              <ImagePlus data-icon="inline-start" /> Agregar página
            </Button>
            <Button variant="outline" size="sm" onClick={() => setOrdenando(true)}>
              <LayoutList data-icon="inline-start" /> Ordenar
            </Button>
            <Button variant="outline" size="sm" disabled={quitadas.length === 0} onClick={() => setDialogo("quitadas")}>
              <Undo data-icon="inline-start" /> Quitadas ({quitadas.length})
            </Button>
            {sinImagen.length > 0 && (
              <Button variant="outline" size="sm" className="border-amber-500/60 text-amber-300" onClick={() => setDialogo("sinimagen")} title="Productos cuya imagen aún no está en R2">
                <ImageOff data-icon="inline-start" /> Sin imagen ({codigosSinImagen})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => void sincronizar()} disabled={yendoASincronizar || publicando} title="Actualiza las tallas y los precios con el ERP, agrega productos nuevos y quita los que ya no tienen stock">
              <RefreshCw data-icon="inline-start" className={yendoASincronizar ? "animate-spin" : undefined} /> {yendoASincronizar ? "Guardando…" : "Sincronizar con el ERP"}
            </Button>
            <BotonPdf entrada={{ titulo, base, paginas, productos, plantillas }} className="h-7" />
            {enlaces && (
              <a href={enlaces.principal} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                <Eye data-icon="inline-start" /> Ver como cliente
              </a>
            )}
            <Button size="sm" onClick={publicar} disabled={publicando || paginas.length === 0}>
              {publicando ? "Publicando…" : versionBase ? "Publicar como versión nueva" : "Publicar"}
            </Button>
          </div>
        </div>

        {sinImagen.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#2a2d35] bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
            <span>
              <strong>{codigosSinImagen.toLocaleString("en-US")} producto{codigosSinImagen === 1 ? "" : "s"} por agregar imagen</strong> ({sinImagen.length.toLocaleString("en-US")} página{sinImagen.length === 1 ? "" : "s"}): su zapatilla sale vacía hasta que la subas.
            </span>
            <button type="button" className="font-medium underline underline-offset-2" onClick={() => setDialogo("sinimagen")}>
              Ver la lista
            </button>
          </div>
        )}

        <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[#2a2d35] px-4 py-2 text-xs", avisosTallas.length > 0 ? "bg-amber-500/10 text-amber-300" : "text-[#9aa0ab]")}>
          <span className="flex items-center gap-1.5">
            Tallas
            <span className="inline-flex overflow-hidden rounded-md border border-[#2a2d35]" role="group" aria-label="Escala de tallas">
              {(["peru", "usa"] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-pressed={escalaTalla === e}
                  disabled={cambiandoEscala}
                  onClick={() => void elegirEscala(e)}
                  className={cn("px-2 py-0.5 transition-colors", escalaTalla === e ? "bg-white/15 text-[#e8e8e8]" : "hover:bg-white/5")}
                >
                  {e === "peru" ? "Perú" : "USA"}
                </button>
              ))}
            </span>
          </span>
          {avisosTallas.length > 0 && (
            <span className="min-w-0">
              <strong>Salen con talla USA por falta de equivalencia:</strong> {avisosTallas.slice(0, 3).join(" · ")}
              {avisosTallas.length > 3 ? ` · y ${avisosTallas.length - 3} más` : ""}{" "}
              <a href="/admin/marketing/tallas" target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
                Agregar en Tallas
              </a>
            </span>
          )}
        </div>

        {(stockAl || sincronizacion) && (
          <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#2a2d35] px-4 py-2 text-xs", quitadosPorStock > 0 ? "bg-amber-500/10 text-amber-300" : "text-[#9aa0ab]")}>
            {stockAl && fechaStock(stockAl) && <span>Stock al {fechaStock(stockAl)}</span>}
            {sincronizacion && (
              <span>
                · Sincronizado con el ERP: {sincronizacion.actualizados.toLocaleString("en-US")} actualizados, {sincronizacion.nuevos.toLocaleString("en-US")} nuevos
                {sincronizacion.reactivados > 0 ? `, ${sincronizacion.reactivados.toLocaleString("en-US")} de vuelta` : ""}, {sincronizacion.quitados.toLocaleString("en-US")} quitados por falta de stock.
              </span>
            )}
            {quitadosPorStock > 0 && (
              <button type="button" className="font-medium underline underline-offset-2" onClick={() => setDialogo("quitadas")}>
                Ver los {quitadosPorStock.toLocaleString("en-US")} quitados
              </button>
            )}
          </div>
        )}

        {mensaje && (
          <div className="space-y-2 border-t border-[#2a2d35] px-4 py-2.5">
            <p className={cn("text-sm", mensaje.ok ? "text-green-400" : "text-red-400")}>{mensaje.texto}</p>
            {enlaces && mensaje.ok && (
              <div className="max-w-2xl space-y-2">
                <EnlaceCatalogo etiqueta="Enlace para clientes" url={enlaces.principal} />
                {enlaces.alterno !== enlaces.principal && <EnlaceCatalogo etiqueta="Alternativo (misma red)" url={enlaces.alterno} />}
              </div>
            )}
          </div>
        )}
      </header>

      <main className="mx-auto p-4 pb-32" style={{ maxWidth: ANCHO_MAX + 32 }}>
        {paginas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#2a2d35] p-8 text-center text-sm text-[#9aa0ab]">
            No quedan páginas. Restaura las quitadas o agrega una página con imagen.
          </p>
        ) : (
          <div ref={listaRef} className="flex flex-col gap-3.5">
            <VisorCtx.Provider value={valor}>
              {paginas.map((pag, i) => (
                <PaginaShell
                  key={pag.id}
                  i={i}
                  pag={pag}
                  prod={pag.tipo === "producto" ? productos[pag.prod] : undefined}
                  pl={pag.tipo === "producto" ? plantillas[pag.plantilla] : undefined}
                  editable
                  seleccionada={pag.id === sel}
                  alSeleccionar={alSeleccionar}
                  alAjustar={alAjustar}
                />
              ))}
            </VisorCtx.Provider>
          </div>
        )}
      </main>

      {/* Barra flotante: las herramientas aparecen al seleccionar una página */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {paginaSel ? (
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-[#2a2d35] bg-[#0e0f12]/95 px-3 py-2 text-xs shadow-2xl backdrop-blur">
            <span className="mr-1 text-[#9aa0ab]">
              Página <strong className="text-[#e8e8e8]">{indice + 1}</strong>
              {productoSel && (
                <>
                  {" · "}
                  <span className="font-mono text-[#e8e8e8]">{productoSel.cod}</span> {productoSel.genero}
                </>
              )}
              {paginaSel.tipo === "fija" && " · página con imagen"}
            </span>
            {paginaSel.tipo === "producto" && (
              <>
                <Button variant="outline" size="icon-sm" aria-label="Achicar" title="Achicar (−)" onClick={() => escalar(1 / 1.03)}>
                  <Minus />
                </Button>
                <Button variant="outline" size="icon-sm" aria-label="Agrandar" title="Agrandar (+)" onClick={() => escalar(1.03)}>
                  <Plus />
                </Button>
                <Button variant="outline" size="sm" disabled={esNeutro(ajusteSel)} onClick={restablecer} title="Volver a la posición del diseño (0)">
                  <RotateCcw data-icon="inline-start" /> Restablecer
                </Button>
                <Button variant={productoSel?.v === 0 ? "default" : "outline"} size="sm" onClick={() => setDialogo("reemplazar")}>
                  <Replace data-icon="inline-start" /> {productoSel?.v === 0 ? "Subir imagen" : "Reemplazar imagen"}
                </Button>
              </>
            )}
            <Button variant="outline" size="icon-sm" aria-label="Subir una posición" disabled={indice === 0} onClick={() => mover(-1)}>
              <ArrowUp />
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Bajar una posición" disabled={indice === paginas.length - 1} onClick={() => mover(1)}>
              <ArrowDown />
            </Button>
            <form
              className="flex items-center gap-1"
              onSubmit={(ev) => {
                ev.preventDefault();
                irAPosicion();
              }}
            >
              <Input value={irA} onChange={(ev) => setIrA(ev.target.value.replace(/\D/g, ""))} placeholder="Mover a…" inputMode="numeric" className="h-7 w-24 text-xs" aria-label="Mover a la posición" />
            </form>
            <Button variant="destructive" size="sm" onClick={quitarSel}>
              <Trash2 data-icon="inline-start" /> Quitar
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Dejar de editar esta página" title="Cerrar herramientas" onClick={() => setSel(null)}>
              <X />
            </Button>
          </div>
        ) : (
          <p className="rounded-full bg-[#0e0f12]/90 px-4 py-1.5 text-center text-xs text-[#9aa0ab] backdrop-blur">
            Toca una página para editarla
            <span className="hidden sm:inline"> · arrastra la zapatilla o usa las flechas, + y −. Los clientes ven los cambios solo al publicar.</span>
          </p>
        )}
      </div>

      {/* Reemplazar la imagen del producto seleccionado */}
      <Dialog open={dialogo === "reemplazar" && !!productoSel} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono">{productoSel?.cod}</DialogTitle>
            <DialogDescription>
              {productoSel?.v === 0
                ? "Este producto aún no tiene imagen. La que subas se guarda en R2 y en la base de datos, y la usarán todas las páginas y catálogos con este código."
                : "La imagen nueva se guarda en R2 y en la base de datos, y la usarán todas las páginas y catálogos con este código al publicar."}
            </DialogDescription>
          </DialogHeader>
          {productoSel && dialogo === "reemplazar" && (
            <ReemplazarImagen
              codigo={productoSel.cod}
              urlActual={`${base}/${encodeURIComponent(productoSel.cod)}.png?v=${productoSel.v}`}
              modo={productoSel.v === 0 ? "nueva" : "reemplazo"}
              refrescar={false}
              onHecho={(v) => {
                setProductos((ps) => ps.map((p) => (p.cod === productoSel.cod ? { ...p, v } : p)));
                setSinPublicar(true);
                setDialogo(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Productos sin imagen: para ir a cada página y subir su imagen */}
      <Dialog open={dialogo === "sinimagen"} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Productos por agregar imagen</DialogTitle>
            <DialogDescription>Su zapatilla sale vacía. Ve a la página o sube la imagen directamente: queda en R2 y la usan todas las páginas con ese código.</DialogDescription>
          </DialogHeader>
          <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
            {sinImagen.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate">
                  <span className="mr-2 text-xs text-muted-foreground">Pág. {x.numero.toLocaleString("en-US")}</span>
                  <span className="font-mono">{x.prod.cod}</span>{" "}
                  <span className="text-muted-foreground">
                    {x.prod.marca} · {x.prod.modelo}
                    {x.prod.genero ? ` · ${x.prod.genero}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSel(x.id);
                      irAPagina(x.id);
                      setDialogo(null);
                    }}
                  >
                    Ir a la página
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setSel(x.id);
                      irAPagina(x.id);
                      setDialogo("reemplazar");
                    }}
                  >
                    Subir imagen
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      {/* Páginas quitadas */}
      <Dialog open={dialogo === "quitadas"} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Páginas quitadas</DialogTitle>
            <DialogDescription>No se muestran a los clientes. Restaura las que quieras volver a incluir.</DialogDescription>
          </DialogHeader>
          <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
            {quitadas.map((q) => {
              const prod = q.tipo === "producto" ? productos[q.prod] : null;
              return (
                <li key={q.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 truncate">
                    {prod ? (
                      <>
                        <span className="font-mono">{prod.cod}</span> <span className="text-muted-foreground">{prod.genero} · {prod.modelo}</span>
                        {q.tipo === "producto" && q.motivo === "sync" && (
                          <span className="ml-2 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-400">sin stock</span>
                        )}
                      </>
                    ) : (
                      "Página con imagen"
                    )}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      cambiar((x) => restaurar(x, q.id, indice >= 0 ? indice + 1 : x.paginas.length));
                      setSel(q.id);
                      irAPagina(q.id);
                      if (quitadas.length === 1) setDialogo(null);
                    }}
                  >
                    Restaurar
                  </Button>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>

      {/* Agregar una página con imagen */}
      <DialogoAgregar
        base={base}
        biblioteca={biblioteca}
        abierto={dialogo === "agregar"}
        alCerrar={() => setDialogo(null)}
        haySeleccion={indice >= 0}
        alAgregar={(pagina, donde) => {
          const pos = donde === "inicio" ? 0 : donde === "despues" && indice >= 0 ? indice + 1 : paginas.length;
          cambiar((x) => {
            const ps = [...x.paginas];
            ps.splice(pos, 0, pagina);
            return { ...x, paginas: ps };
          });
          setSel(pagina.id);
          irAPagina(pagina.id);
          setDialogo(null);
        }}
      />
      {ordenando && <OrdenarCatalogo
        paginas={paginas}
        productos={productos}
        biblioteca={biblioteca}
        base={base}
        alCambiar={(f) => cambiar((actual) => ({ ...actual, paginas: f(actual.paginas) }))}
        alQuitar={(paginaId) => cambiar((actual) => quitar(actual, paginaId))}
        alCerrar={() => setOrdenando(false)}
      />}
    </div>
  );
}

// ---------- diálogo: agregar página con imagen ----------
const TIPOS_FIJA: { tipo: FijaBiblioteca["tipo"]; titulo: string }[] = [
  { tipo: "portada", titulo: "Portadas" },
  { tipo: "separador", titulo: "Separadores" },
  { tipo: "separador_marca", titulo: "Separadores de marca" },
  { tipo: "cierre", titulo: "Cierres" },
  { tipo: "otra", titulo: "Otras" },
];

function DialogoAgregar({
  base,
  biblioteca,
  abierto,
  alCerrar,
  haySeleccion,
  alAgregar,
}: {
  base: string;
  biblioteca: FijaBiblioteca[];
  abierto: boolean;
  alCerrar: () => void;
  haySeleccion: boolean;
  alAgregar: (pagina: PaginaFija, donde: "inicio" | "despues" | "final") => void;
}) {
  const [donde, setDonde] = useState<"inicio" | "despues" | "final">("inicio");
  const [estado, setEstado] = useState<"reposo" | "subiendo">("reposo");
  const [error, setError] = useState<string | null>(null);

  async function subir(archivo: File) {
    setError(null);
    setEstado("subiendo");
    try {
      const blob = await prepararPaginaFija(archivo);
      const r = await enviarPaginaFija(blob);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      alAgregar({ id: nuevoId("f"), tipo: "fija", imagen: r.imagen, ancho: r.ancho, alto: r.alto }, donde);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo procesar la imagen");
    } finally {
      setEstado("reposo");
    }
  }

  const opciones: [typeof donde, string, boolean][] = [
    ["inicio", "Al inicio", true],
    ["despues", "Después de la página seleccionada", haySeleccion],
    ["final", "Al final", true],
  ];

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && estado === "reposo" && alCerrar()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Agregar página</DialogTitle>
          <DialogDescription>Elige una página de la biblioteca de Marketing o sube una imagen nueva.</DialogDescription>
        </DialogHeader>
        <fieldset className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm" disabled={estado === "subiendo"}>
          <legend className="mb-1 text-xs font-medium text-muted-foreground">Dónde agregarla</legend>
          {opciones.map(([valor, texto, activa]) => (
            <label key={valor} className={cn("flex items-center gap-2", !activa && "opacity-50")}>
              <input type="radio" name="donde" checked={donde === valor} disabled={!activa} onChange={() => setDonde(valor)} />
              {texto}
            </label>
          ))}
        </fieldset>

        {TIPOS_FIJA.map(({ tipo, titulo }) => {
          const lista = biblioteca.filter((f) => f.tipo === tipo);
          if (lista.length === 0) return null;
          return (
            <section key={tipo} className="space-y-1.5">
              <h3 className="text-xs font-medium text-muted-foreground">{titulo}</h3>
              <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {lista.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      disabled={estado === "subiendo"}
                      onClick={() => alAgregar({ id: nuevoId("f"), tipo: "fija", imagen: f.imagen, ancho: f.ancho, alto: f.alto }, donde)}
                      className="group block w-full overflow-hidden rounded-lg border border-[#2a2d35] text-left transition-colors hover:border-white/50 focus-visible:border-white/70 focus-visible:outline-none"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`${base}/${f.imagen}-min.webp`} alt="" loading="lazy" decoding="async" className="aspect-video w-full object-cover" />
                      <span className="block truncate px-2 py-1.5 text-xs">{f.nombre}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="space-y-1.5 border-t border-[#2a2d35] pt-3">
          <p className="text-xs text-muted-foreground">O sube una imagen nueva, solo para este catálogo (16:9, JPG, PNG o WebP de hasta 4 MB).</p>
          <label
            className={cn(
              buttonVariants({ variant: "outline" }),
              "cursor-pointer justify-center",
              estado === "subiendo" && "pointer-events-none opacity-60"
            )}
          >
            {estado === "subiendo" ? "Subiendo…" : "Subir imagen nueva"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(ev) => {
                const f = ev.target.files?.[0];
                ev.target.value = "";
                if (f) void subir(f);
              }}
            />
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
}
