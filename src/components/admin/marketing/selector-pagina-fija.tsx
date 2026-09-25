"use client";
/* eslint-disable @next/next/no-img-element -- Las miniaturas ya se generan como WebP en R2. */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FijaBiblioteca } from "@/lib/marketing-catalogo";
import { claveNombre } from "@/lib/marketing-disenos-nombres";
import { enviarDiseno, enviarPaginaFija, prepararPaginaFija } from "@/lib/subir-imagen-cliente";
import { guardaEnBiblioteca, validarArchivoPagina, type ModoSubidaPagina } from "./selector-pagina-fija-logica";

const TIPOS: { id: FijaBiblioteca["tipo"]; titulo: string }[] = [
  { id: "portada", titulo: "Portadas" },
  { id: "separador", titulo: "Separadores" },
  { id: "separador_marca", titulo: "Separadores de marca" },
  { id: "cierre", titulo: "Cierres" },
  { id: "otra", titulo: "Otras páginas" },
];

export type PosicionPagina = { id: string; titulo: string; deshabilitada?: boolean };

export function SelectorPaginaFija({ base, biblioteca, existentes = biblioteca, tituloPosicion, posiciones, posicionInicial, marcas = [], modoSubida, tipoInicial = "separador", marcaInicial, alAgregar, alCerrar }: {
  base: string;
  biblioteca: readonly FijaBiblioteca[];
  existentes?: readonly FijaBiblioteca[];
  tituloPosicion?: string;
  posiciones?: readonly PosicionPagina[];
  posicionInicial?: string;
  marcas?: readonly string[];
  /** Biblioteca: el diseño queda disponible en futuros catálogos. Catálogo: solo en el borrador actual. */
  modoSubida: ModoSubidaPagina;
  tipoInicial?: FijaBiblioteca["tipo"];
  marcaInicial?: string;
  alAgregar: (fija: FijaBiblioteca, posicion: string, nueva: boolean) => void;
  alCerrar: () => void;
}) {
  const [posicion, setPosicion] = useState(posicionInicial ?? posiciones?.find((p) => !p.deshabilitada)?.id ?? "");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<FijaBiblioteca["tipo"]>(tipoInicial);
  const [guardarBiblioteca, setGuardarBiblioteca] = useState(modoSubida === "biblioteca");
  const [marca, setMarca] = useState(marcaInicial ?? marcas[0] ?? "");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arrastrandoArchivo, setArrastrandoArchivo] = useState(false);
  const inputArchivo = useRef<HTMLInputElement>(null);
  const miniatura = useMemo(() => archivo ? URL.createObjectURL(archivo) : null, [archivo]);
  const enBiblioteca = guardaEnBiblioteca(modoSubida, guardarBiblioteca);
  const duplicado = enBiblioteca && existentes.some((f) => f.tipo === tipo && (tipo === "separador_marca" ? f.marca?.trim().toUpperCase() === marca.trim().toUpperCase() : claveNombre(f.nombre) === claveNombre(nombre)));

  useEffect(() => () => { if (miniatura) URL.revokeObjectURL(miniatura); }, [miniatura]);

  function seleccionarArchivo(nuevo: File | null) {
    if (!nuevo) return;
    const problema = validarArchivoPagina(nuevo.type, nuevo.size);
    if (problema) { setArchivo(null); setError(problema); return; }
    setArchivo(nuevo);
    setNombre(nuevo.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
    setError(null);
  }

  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previo; };
  }, []);

  useEffect(() => {
    const cerrarConEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      if (!subiendo) alCerrar();
    };
    document.addEventListener("keydown", cerrarConEscape, true);
    return () => { document.removeEventListener("keydown", cerrarConEscape, true); };
  }, [alCerrar, subiendo]);

  async function subir() {
    if (!archivo || subiendo) return;
    const problema = validarArchivoPagina(archivo.type, archivo.size);
    if (problema) { setError(problema); return; }
    if (enBiblioteca && (nombre.trim().length < 2 || (tipo === "separador_marca" && !marca))) {
      setError("Escribe un nombre y, para un separador de marca, elige la marca.");
      return;
    }
    if (duplicado) { setError("Ese diseño ya existe en la biblioteca. Elige el existente o cambia el nombre."); return; }
    setSubiendo(true);
    setError(null);
    try {
      const blob = await prepararPaginaFija(archivo);
      if (!enBiblioteca) {
        const r = await enviarPaginaFija(blob);
        if (!r.ok) { setError(r.error); return; }
        alAgregar({ id: r.imagen, nombre: nombre.trim() || "Página subida", tipo: "otra", imagen: r.imagen, ancho: r.ancho, alto: r.alto, auto_tipo: null, auto_posicion: null }, posicion, true);
      } else {
        const r = await enviarDiseno(blob, { clase: "fija", tipo, nombre: nombre.trim(), aplica: "", posicion: "", ...(tipo === "separador_marca" ? { marca } : {}) });
        if (!r.ok) { setError(r.error); return; }
        if (!r.fija) { setError("El diseño se subió, pero no se pudo agregar. Recarga la página para encontrarlo en la biblioteca."); return; }
        alAgregar(r.fija, posicion, true);
      }
      alCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la imagen");
    } finally {
      setSubiendo(false);
    }
  }

  return createPortal(
    <div className="dark fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-3 text-[#e8e8e8]" role="dialog" aria-modal="true" aria-label="Agregar página" onMouseDown={(e) => { if (e.target === e.currentTarget && !subiendo) alCerrar(); }}>
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[#2a2d35] bg-[#14161a] shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-[#2a2d35] px-4 py-3">
          <div><h2 className="text-base font-semibold">Agregar página</h2><p className="text-xs text-[#9aa0ab]">Elige una página de la biblioteca o sube una imagen nueva.</p></div>
          <Button variant="ghost" size="icon" onClick={alCerrar} disabled={subiendo} aria-label="Cerrar"><X /></Button>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {posiciones ? <fieldset className="flex flex-wrap gap-x-5 gap-y-2 text-xs"><legend className="mb-2 font-medium text-[#9aa0ab]">Dónde agregarla</legend>{posiciones.map((p) => <label key={p.id} className={`flex items-center gap-1.5 ${p.deshabilitada ? "opacity-40" : ""}`}><input type="radio" name="posicion-pagina" checked={posicion === p.id} disabled={p.deshabilitada || subiendo} onChange={() => setPosicion(p.id)} />{p.titulo}</label>)}</fieldset> : tituloPosicion ? <p className="rounded-lg border border-[#2a2d35] px-3 py-2 text-xs text-[#c9ced8]">{tituloPosicion}</p> : null}
          <section className="space-y-3" aria-labelledby="subir-pagina-titulo">
            <div><h3 id="subir-pagina-titulo" className="text-sm font-medium">Subir nuevo diseño</h3><p className="text-xs text-[#9aa0ab]">{enBiblioteca ? "Se agrega aquí y queda disponible en la biblioteca de Marketing. Debe ser horizontal 16:9." : "Se agrega aquí, solo para este catálogo."} JPG, PNG o WebP, hasta 4 MB.</p></div>
            <input ref={inputArchivo} type="file" accept="image/png,image/jpeg,image/webp" disabled={subiendo} className="sr-only" aria-label="Elegir imagen para la página" onChange={(e) => { seleccionarArchivo(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            <div
              role="button"
              tabIndex={subiendo ? -1 : 0}
              aria-label="Arrastra una imagen aquí o pulsa para elegirla"
              onClick={() => { if (!subiendo) inputArchivo.current?.click(); }}
              onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !subiendo) { e.preventDefault(); inputArchivo.current?.click(); } }}
              onDragEnter={(e) => { e.preventDefault(); if (!subiendo) setArrastrandoArchivo(true); }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = subiendo ? "none" : "copy"; if (!subiendo) setArrastrandoArchivo(true); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setArrastrandoArchivo(false); }}
              onDrop={(e) => { e.preventDefault(); setArrastrandoArchivo(false); if (!subiendo) seleccionarArchivo(e.dataTransfer.files[0] ?? null); }}
              className={`flex min-h-28 cursor-pointer items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 text-center transition-colors focus-visible:outline-2 focus-visible:outline-white/70 ${arrastrandoArchivo ? "border-sky-400 bg-sky-400/10" : "border-[#3a3e48] bg-[#0e0f12] hover:border-[#7b8493]"}`}
            >
              {miniatura && <img src={miniatura} alt="Vista previa del diseño elegido" className="h-16 w-28 rounded object-cover" />}
              <div><Upload className="mx-auto mb-1 h-5 w-5 text-sky-300" aria-hidden /><p className="text-sm">{archivo ? archivo.name : "Arrastra la imagen aquí"}</p><p className="text-xs text-[#9aa0ab]">{archivo ? "Pulsa para cambiarla" : "o pulsa para elegir un archivo"}</p></div>
            </div>
            {archivo && <div className="space-y-3 rounded-lg border border-[#2a2d35] p-3">
              {modoSubida === "ambos" && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={guardarBiblioteca} onChange={(e) => setGuardarBiblioteca(e.target.checked)} disabled={subiendo} /> Guardar también en la biblioteca de diseños</label>}
              {enBiblioteca && <div className="grid gap-2 sm:grid-cols-2"><input aria-label="Nombre del diseño" placeholder="Nombre del diseño" value={nombre} maxLength={60} disabled={subiendo} onChange={(e) => setNombre(e.target.value)} className="h-9 rounded-md border border-[#3a3e48] bg-[#0e0f12] px-2 text-sm" /><select aria-label="Tipo de diseño" value={tipo} disabled={subiendo} onChange={(e) => setTipo(e.target.value as FijaBiblioteca["tipo"])} className="h-9 rounded-md border border-[#3a3e48] bg-[#0e0f12] px-2 text-sm">{TIPOS.map((t) => <option key={t.id} value={t.id}>{t.titulo}</option>)}</select>{tipo === "separador_marca" && <select aria-label="Marca del separador" value={marca} disabled={subiendo} onChange={(e) => setMarca(e.target.value)} className="h-9 rounded-md border border-[#3a3e48] bg-[#0e0f12] px-2 text-sm"><option value="">Elige una marca</option>{marcas.map((m) => <option key={m} value={m}>{m}</option>)}</select>}</div>}
              {duplicado && <p className="text-xs text-amber-400">Ese diseño ya existe. Elígelo abajo o cambia el nombre para crear otro.</p>}
              <Button onClick={() => void subir()} disabled={subiendo || duplicado}><Upload data-icon="inline-start" /> {subiendo ? "Subiendo…" : "Subir y usar"}</Button>
            </div>}
            {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
          </section>
          <div className="space-y-5 border-t border-[#2a2d35] pt-4">
            <h3 className="text-sm font-medium">Biblioteca de Marketing</h3>
            {biblioteca.length === 0 && <p className="rounded-lg border border-dashed border-[#2a2d35] p-5 text-center text-sm text-[#9aa0ab]">No hay páginas disponibles en la biblioteca. Puedes subir una imagen arriba.</p>}
            {TIPOS.map(({ id, titulo }) => {
              const lista = biblioteca.filter((f) => f.tipo === id);
              if (lista.length === 0) return null;
              return <section key={id}><h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-[#9aa0ab]">{titulo}</h4><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{lista.map((f) => <button type="button" key={f.id} disabled={subiendo} onClick={() => { alAgregar(f, posicion, false); alCerrar(); }} className="overflow-hidden rounded-lg border border-[#2a2d35] text-left transition-colors hover:border-[#5b6270] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"><img src={`${base}/${f.imagen}-min.webp`} alt="" loading="lazy" className="aspect-video w-full object-cover" /><span className="flex items-center gap-1.5 px-2 py-1.5 text-xs"><Plus className="h-3.5 w-3.5 text-[#9aa0ab]" /><span className="truncate">{f.nombre}</span></span></button>)}</div></section>;
            })}
          </div>
        </div>
      </div>
    </div>, document.body
  );
}
