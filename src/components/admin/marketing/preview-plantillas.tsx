"use client";

// Preview a pantalla completa del DOCUMENTO del catálogo, en el orden en que saldrá: la portada, las páginas
// informativas, el bloque de productos (la plantilla de cada marca) y los cierres.
//   · «Ordenar»: lista compacta donde se arrastran o suben/bajan las páginas, se quitan y se agregan desde la
//     biblioteca de diseños (términos al inicio, más páginas informativas…).
//   · «Vista grande»: cada hoja a tamaño de lectura, solo para mirar.
// El orden que se deja aquí es el que se genera. Desde aquí se sigue al paso de acomodar la zapatilla.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Combine, GripVertical, LayoutList, Maximize2, Plus, RotateCcw, Rows3, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { claveDeMarca, type FijaBiblioteca } from "@/lib/marketing-catalogo";
import { cn } from "@/lib/utils";
import { SelectorPaginaFija } from "./selector-pagina-fija";
import { insertarEnOrden, posicionAntesDeMarca } from "./selector-pagina-fija-logica";
import { ordenPorMarcas, ordenSinMarcas, type DocumentoCatalogo, type Hoja, type ItemDocumento } from "./documento-catalogo";

type Modo = "ordenar" | "grande";

const src = (base: string, h: Hoja) => `${base}/${h.imagen}${h.miniatura ? "-min" : ""}.webp`;

export function PreviewPlantillas({
  base,
  documento,
  alCambiarOrden,
  alRestablecer,
  alNuevaFija,
  alCerrar,
  alSiguiente,
}: {
  base: string;
  documento: DocumentoCatalogo;
  /** Nuevo orden del documento (ids de fijas y CLAVE_PRODUCTOS). */
  alCambiarOrden: (orden: string[]) => void;
  /** Vuelve al orden automático. */
  alRestablecer: () => void;
  alNuevaFija: (fija: FijaBiblioteca, orden: string[]) => void;
  alCerrar: () => void;
  alSiguiente?: () => void;
}) {
  const { orden, secuencia } = documento;
  const [modo, setModo] = useState<Modo>("grande");
  // Lugar del documento (0 = al principio) donde se agrega una página; null = el selector está cerrado.
  const [agregarEn, setAgregarEn] = useState<number | null>(null);
  const [subirMarca, setSubirMarca] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);

  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previo; };
  }, []);

  useEffect(() => {
    // Escape cierra primero el selector de páginas y, si no hay, el Preview.
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (agregarEn !== null) { setAgregarEn(null); setSubirMarca(null); }
      else alCerrar();
    };
    document.addEventListener("keydown", h);
    return () => { document.removeEventListener("keydown", h); };
  }, [alCerrar, agregarEn]);

  /** Mueve `clave` para que quede en el hueco `destino` (0 = antes del primero, n = después del último). */
  function mover(clave: string, destino: number) {
    const desde = orden.indexOf(clave);
    if (desde === -1) return;
    const resto = orden.filter((c) => c !== clave);
    resto.splice(destino > desde ? destino - 1 : destino, 0, clave);
    if (resto.every((c, i) => c === orden[i])) return;
    alCambiarOrden(resto);
  }
  const quitar = (clave: string) => alCambiarOrden(orden.filter((c) => c !== clave));
  function agregar(id: string, nueva?: FijaBiblioteca) {
    const en = agregarEn ?? orden.length;
    const nuevoOrden = insertarEnOrden(orden, id, en);
    if (nueva) alNuevaFija(nueva, nuevoOrden);
    else alCambiarOrden(nuevoOrden);
    setAgregarEn(null);
  }

  const soltar = (destino: number) => {
    if (arrastrando) mover(arrastrando, destino);
    setArrastrando(null);
    setSobre(null);
  };

  const antesDe = (e: React.DragEvent<HTMLElement>, i: number) => {
    // Mitad de arriba de la fila = antes de ella; mitad de abajo = después.
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY < r.top + r.height / 2 ? i : i + 1;
  };

  const enDocumento = new Set(orden);
  // Los separadores de marca solo se ofrecen con el bloque separado por marcas (si no, no tendrían dónde ir).
  const disponibles = documento.biblioteca.filter((f) => !enDocumento.has(f.id) && (f.tipo !== "separador_marca" || documento.porMarcas));
  const idsSeparadoresMarca = new Set(documento.biblioteca.filter((f) => f.tipo === "separador_marca").map((f) => f.id));
  const separarPorMarcas = () => alCambiarOrden(ordenPorMarcas(orden, documento.marcasBloque));
  const unirMarcas = () => alCambiarOrden(ordenSinMarcas(orden, idsSeparadoresMarca));
  const avisos = documento.porMarcas ? <AvisosSeparadores documento={documento} alSubir={(marca) => {
    setSubirMarca(marca);
    setAgregarEn(posicionAntesDeMarca(orden, claveDeMarca(marca)));
  }} /> : null;

  return createPortal(
    <div className="dark fixed inset-0 z-50 overflow-y-auto bg-[#0e0f12] text-[#e8e8e8] animate-in fade-in duration-300" role="dialog" aria-label="Preview del documento">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-[#2a2d35] bg-[#0e0f12]/90 px-4 py-3 backdrop-blur">
        <Button variant="outline" size="icon" onClick={alCerrar} aria-label="Cerrar preview">
          <X />
        </Button>
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold">Preview del documento</h2>
          <p className="text-xs text-[#9aa0ab]">
            {modo === "ordenar"
              ? "Arrastra las páginas para ordenarlas, quita las que no quieras o agrega más. Las plantillas de marca se repiten con cada producto."
              : `${documento.hojas.length} hojas en el orden en que saldrán; las plantillas de marca se repiten con cada producto`}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-[#2a2d35] p-0.5" role="group" aria-label="Vista">
            <Button variant={modo === "ordenar" ? "secondary" : "ghost"} size="sm" onClick={() => setModo("ordenar")} aria-pressed={modo === "ordenar"}>
              <LayoutList data-icon="inline-start" /> Ordenar
            </Button>
            <Button variant={modo === "grande" ? "secondary" : "ghost"} size="sm" onClick={() => setModo("grande")} aria-pressed={modo === "grande"}>
              <Maximize2 data-icon="inline-start" /> Vista grande
            </Button>
          </div>
          {documento.personalizado && (
            <Button variant="ghost" size="sm" onClick={alRestablecer}>
              <RotateCcw data-icon="inline-start" /> Orden automático
            </Button>
          )}
          {alSiguiente ? (
            <Button onClick={alSiguiente}>
              Siguiente: acomodar la zapatilla <ArrowRight data-icon="inline-end" />
            </Button>
          ) : (
            <p className="text-xs text-amber-400">Elige una portada (o «Sin portada») para continuar</p>
          )}
        </div>
      </header>

      {modo === "ordenar" ? (
        <div className="mx-auto max-w-3xl px-4 py-6" onDragEnd={() => { setArrastrando(null); setSobre(null); }}>
          {documento.porMarcas && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-sky-400/30 bg-sky-400/[0.06] px-3 py-2.5">
              <Rows3 className="h-4 w-4 shrink-0 text-sky-300" aria-hidden />
              <p className="min-w-0 flex-1 text-xs text-[#c9ced8]">Los productos están separados por marca: cada marca lleva su separador antes de sus páginas. Puedes mover los bloques, quitar un separador o agregar otras páginas entre marcas.</p>
              <Button variant="outline" size="sm" onClick={unirMarcas}>
                <Combine data-icon="inline-start" /> Unir en un solo bloque
              </Button>
            </div>
          )}
          {avisos && <div className="mb-3">{avisos}</div>}
          <ol>
            {secuencia.map((it, i) => (
              <li key={it.clave}>
                <Hueco
                  lugar={i}
                  activo={arrastrando !== null && sobre === i}
                  arrastrando={arrastrando !== null}
                  alAgregar={() => setAgregarEn(i)}
                  alSobre={() => setSobre(i)}
                  alSoltar={() => soltar(i)}
                />
                <Fila
                  base={base}
                  item={it}
                  numero={i + 1}
                  esUltimo={i === secuencia.length - 1}
                  esPrimero={i === 0}
                  arrastrada={arrastrando === it.clave}
                  alArrastrar={() => setArrastrando(it.clave)}
                  alSobre={(e) => {
                    if (arrastrando === null) return;
                    e.preventDefault();
                    setSobre(antesDe(e, i));
                  }}
                  alSoltar={(e) => {
                    e.preventDefault();
                    soltar(antesDe(e, i));
                  }}
                  alSubir={() => mover(it.clave, i - 1)}
                  alBajar={() => mover(it.clave, i + 2)}
                  alQuitar={it.tipo === "fija" ? () => quitar(it.clave) : undefined}
                  accion={
                    it.tipo === "productos" && documento.marcasBloque.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="xs" onClick={separarPorMarcas}>
                          <Rows3 data-icon="inline-start" /> Separar por marcas
                        </Button>
                        {documento.sinSeparadoresDeMarca && <span className="text-[11px] text-amber-400">Aún no hay separadores de marca subidos</span>}
                      </div>
                    ) : null
                  }
                />
              </li>
            ))}
            <li>
              <Hueco
                lugar={secuencia.length}
                activo={arrastrando !== null && sobre === secuencia.length}
                arrastrando={arrastrando !== null}
                alAgregar={() => setAgregarEn(secuencia.length)}
                alSobre={() => setSobre(secuencia.length)}
                alSoltar={() => soltar(secuencia.length)}
              />
            </li>
          </ol>
          {secuencia.length === 1 && <p className="mt-4 text-center text-xs text-[#9aa0ab]">Este catálogo solo lleva las páginas de producto. Agrega una portada o páginas informativas con «＋».</p>}
        </div>
      ) : (
        <div className="mx-auto max-w-5xl space-y-9 px-4 py-8">
          {avisos}
          {documento.hojas.length === 0 && <p className="rounded-lg border border-dashed border-[#2a2d35] p-8 text-center text-sm text-[#9aa0ab]">No hay diseños para estos filtros: vuelve al paso anterior.</p>}
          {documento.hojas.map((h, i) => (
            <figure key={h.id} className="animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-500" style={{ animationDelay: `${Math.min(i, 5) * 70}ms` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${base}/${h.imagen}.webp`}
                alt={h.titulo}
                loading={i < 2 ? "eager" : "lazy"}
                decoding="async"
                className={cn("w-full rounded-lg border", h.manual ? "border-dashed border-amber-400/60" : "border-[#2a2d35]")}
                style={{ aspectRatio: `${h.ancho} / ${h.alto}` }}
              />
              <figcaption className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-[#c9ced8]">
                  {i + 1} · {h.etiqueta}
                </span>
                <span className="font-medium">{h.titulo}</span>
                {h.detalle && <span className="text-[#9aa0ab]">{h.detalle}</span>}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {agregarEn !== null && <SelectorPaginaFija
        base={base}
        biblioteca={disponibles}
        existentes={documento.biblioteca}
        marcas={documento.marcasBloque.map((m) => m.marca)}
        modoSubida="biblioteca"
        tipoInicial={subirMarca ? "separador_marca" : undefined}
        marcaInicial={subirMarca ?? undefined}
        tituloPosicion={agregarEn === 0 ? "Se agregará al principio del catálogo." : agregarEn >= secuencia.length ? "Se agregará al final del catálogo." : `Se agregará en la posición ${agregarEn + 1}.`}
        alAgregar={(fija, _posicion, nueva) => agregar(fija.id, nueva ? fija : undefined)}
        alCerrar={() => { setAgregarEn(null); setSubirMarca(null); }}
      />}
    </div>,
    document.body
  );
}

/** Hueco entre dos filas: recibe lo que se arrastra y ofrece «＋» para agregar una página en ese lugar. */
function Hueco({ lugar, activo, arrastrando, alAgregar, alSobre, alSoltar }: { lugar: number; activo: boolean; arrastrando: boolean; alAgregar: () => void; alSobre: () => void; alSoltar: () => void }) {
  return (
    <div
      className="group relative flex h-7 items-center justify-center"
      onDragOver={(e) => {
        if (!arrastrando) return;
        e.preventDefault();
        alSobre();
      }}
      onDrop={(e) => {
        e.preventDefault();
        alSoltar();
      }}
    >
      <div className={cn("absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full transition-colors", activo ? "bg-sky-400" : "bg-transparent group-hover:bg-[#2a2d35]")} />
      {!arrastrando && (
        <button
          type="button"
          onClick={alAgregar}
          className="relative inline-flex items-center gap-1 rounded-full border border-[#2a2d35] bg-[#0e0f12] px-2.5 py-0.5 text-[11px] text-[#9aa0ab] opacity-0 transition-opacity hover:text-white focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
          aria-label={`Agregar una página en la posición ${lugar + 1}`}
        >
          <Plus className="h-3 w-3" /> Agregar página aquí
        </button>
      )}
    </div>
  );
}

function Fila({
  base,
  item,
  numero,
  esPrimero,
  esUltimo,
  arrastrada,
  alArrastrar,
  alSobre,
  alSoltar,
  alSubir,
  alBajar,
  alQuitar,
  accion,
}: {
  base: string;
  item: ItemDocumento;
  numero: number;
  esPrimero: boolean;
  esUltimo: boolean;
  arrastrada: boolean;
  alArrastrar: () => void;
  alSobre: (e: React.DragEvent<HTMLElement>) => void;
  alSoltar: (e: React.DragEvent<HTMLElement>) => void;
  alSubir: () => void;
  alBajar: () => void;
  alQuitar?: () => void;
  /** Botón propio de la fila (separar el bloque de productos por marcas). */
  accion?: React.ReactNode;
}) {
  const productos = item.tipo !== "fija";
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", item.clave);
        alArrastrar();
      }}
      onDragOver={alSobre}
      onDrop={alSoltar}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-2.5 transition-opacity",
        productos ? "border-sky-400/40 bg-sky-400/[0.06]" : "border-[#2a2d35] bg-[#14161a]",
        arrastrada && "opacity-40"
      )}
    >
      <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-[#6b7280] active:cursor-grabbing" aria-hidden />
      <span className="w-5 shrink-0 text-center text-xs tabular-nums text-[#9aa0ab]">{numero}</span>
      <div className="flex shrink-0 -space-x-6">
        {item.hojas.length === 0 && <div className="aspect-video w-28 rounded-md border border-dashed border-[#2a2d35]" />}
        {item.hojas.slice(0, 3).map((h) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={h.id} src={src(base, h)} alt="" draggable={false} loading="lazy" decoding="async" className="aspect-video w-28 rounded-md border border-[#2a2d35] bg-[#0e0f12] object-cover shadow-md" />
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <span className={cn("rounded-full px-2 py-0.5 text-[11px]", productos ? "bg-sky-400/20 text-sky-200" : "bg-white/10 text-[#c9ced8]")}>{item.etiqueta}</span>
        <p className="mt-1 truncate text-sm font-medium">{item.titulo}</p>
        {item.detalle && <p className="truncate text-xs text-[#9aa0ab]">{item.detalle}</p>}
        {accion}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="icon-sm" onClick={alSubir} disabled={esPrimero} aria-label={`Subir «${item.titulo}»`}>
          <ArrowUp />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={alBajar} disabled={esUltimo} aria-label={`Bajar «${item.titulo}»`}>
          <ArrowDown />
        </Button>
        {alQuitar && (
          <Button variant="ghost" size="icon-sm" onClick={alQuitar} aria-label={`Quitar «${item.titulo}» del documento`}>
            <X />
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Avisos de los separadores de marca (solo con el bloque separado por marcas): si no hay ninguno en la biblioteca o
 * a alguna marca del catálogo le falta el suyo, con el botón para subirlo ahí mismo.
 */
function AvisosSeparadores({ documento, alSubir }: { documento: DocumentoCatalogo; alSubir: (marca: string) => void }) {
  const faltan = documento.sinSeparador;
  if (faltan.length === 0) return null;
  const ninguno = documento.sinSeparadoresDeMarca;
  return (
    <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2.5 text-amber-200" role="alert">
      <p className="flex items-start gap-2 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          {ninguno
            ? "No hay separadores de marca en la biblioteca."
            : `${faltan.length === 1 ? "Esta marca no tiene" : "Estas marcas no tienen"} separador: ${faltan.join(", ")}.`}{" "}
          Esas marcas saldrán sin separador. Súbelo aquí o, para muchos a la vez, en Catálogos → Subir diseños con el nombre «SEPARADOR MARCA {faltan[0]}».
        </span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2 pl-6">
        {faltan.map((m) => (
          <Button key={m} variant="outline" size="xs" onClick={() => alSubir(m)}>
            <Upload data-icon="inline-start" /> Subir separador de {m}
          </Button>
        ))}
      </div>
    </div>
  );
}
