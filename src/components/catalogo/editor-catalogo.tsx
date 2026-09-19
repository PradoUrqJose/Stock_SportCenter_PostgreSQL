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
  Redo2,
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
import { guardarEdicion, publicarCatalogo } from "@/lib/actions/marketing-catalogos";
import { enviarPaginaFija, prepararPaginaFija } from "@/lib/subir-imagen-cliente";
import type { Ajuste, PaginaCat, PaginaFija, PlantillaSnap, ProductoCat } from "@/lib/marketing-catalogo";
import { cn } from "@/lib/utils";
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
  const p = e.paginas.find((x) => x.id === id);
  if (!p) return e;
  return { paginas: e.paginas.filter((x) => x.id !== id), quitadas: [...e.quitadas, p] };
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
  const [dialogo, setDialogo] = useState<"quitadas" | "agregar" | "reemplazar" | null>(null);
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
      router.replace(`/admin/marketing/catalogos/${id}/editar?version=${r.data.version}&publicado=${r.data.version}`);
    } else {
      setPublicando(false);
      setMensaje({ ok: false, texto: r.msg });
    }
  }

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
            <Button variant="outline" size="sm" disabled={quitadas.length === 0} onClick={() => setDialogo("quitadas")}>
              <Undo data-icon="inline-start" /> Quitadas ({quitadas.length})
            </Button>
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
                <Button variant="outline" size="sm" onClick={() => setDialogo("reemplazar")}>
                  <Replace data-icon="inline-start" /> Reemplazar imagen
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
              La imagen nueva se guarda en R2 y en la base de datos, y la usarán todas las páginas y catálogos con este código al publicar.
            </DialogDescription>
          </DialogHeader>
          {productoSel && dialogo === "reemplazar" && (
            <ReemplazarImagen
              codigo={productoSel.cod}
              urlActual={`${base}/${encodeURIComponent(productoSel.cod)}.png?v=${productoSel.v}`}
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
    </div>
  );
}

// ---------- diálogo: agregar página con imagen ----------
function DialogoAgregar({
  abierto,
  alCerrar,
  haySeleccion,
  alAgregar,
}: {
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
    ["inicio", "Al inicio (portada)", true],
    ["despues", "Después de la página seleccionada", haySeleccion],
    ["final", "Al final", true],
  ];

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && estado === "reposo" && alCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar página con imagen</DialogTitle>
          <DialogDescription>
            Sube la imagen de una página completa (portada, divisor de marca, redes…). Ideal en formato 16:9, por ejemplo 2000×1141. JPG, PNG o WebP de hasta 4 MB.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-1.5 text-sm" disabled={estado === "subiendo"}>
          <legend className="mb-1 text-xs font-medium text-muted-foreground">Dónde agregarla</legend>
          {opciones.map(([valor, texto, activa]) => (
            <label key={valor} className={cn("flex items-center gap-2", !activa && "opacity-50")}>
              <input type="radio" name="donde" checked={donde === valor} disabled={!activa} onChange={() => setDonde(valor)} />
              {texto}
            </label>
          ))}
        </fieldset>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <label
          className={cn(
            buttonVariants({ variant: "default" }),
            "cursor-pointer justify-center",
            estado === "subiendo" && "pointer-events-none opacity-60"
          )}
        >
          {estado === "subiendo" ? "Subiendo…" : "Elegir imagen"}
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
      </DialogContent>
    </Dialog>
  );
}
