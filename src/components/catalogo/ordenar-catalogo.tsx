"use client";
/* eslint-disable @next/next/no-img-element -- Las miniaturas WebP ya están optimizadas en la biblioteca de Marketing. */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, GripVertical, Plus, Rows3, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectorPaginaFija } from "@/components/admin/marketing/selector-pagina-fija";
import type { FijaBiblioteca, PaginaCat, PaginaFija, ProductoCat } from "@/lib/marketing-catalogo";
import logos from "../../../public/marcas/fuentes.json";
import { bloquesDe, insertarFija, marcasDe, moverBloque, rutaLogoMarca, separarPorMarcas, svgLogoMarca, tieneProductosIntercalados } from "./ordenar-catalogo-logica";

function LogoMarca({ marca }: { marca: string }) {
  const ruta = rutaLogoMarca(marca, logos);
  return <img src={ruta ?? `data:image/svg+xml,${encodeURIComponent(svgLogoMarca(marca))}`} alt={`Logo de ${marca}`} className="h-14 w-24 shrink-0 rounded-md border border-sky-400/25 bg-white object-contain p-1" />;
}

const nuevoId = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function OrdenarCatalogo({ paginas, productos, biblioteca, base, alCambiar, alQuitar, alNuevaFija, alCerrar }: {
  paginas: PaginaCat[];
  productos: ProductoCat[];
  biblioteca: FijaBiblioteca[];
  base: string;
  alCambiar: (f: (paginas: PaginaCat[]) => PaginaCat[]) => void;
  alQuitar: (id: string) => void;
  alNuevaFija: (fija: FijaBiblioteca) => void;
  alCerrar: () => void;
}) {
  const [separado, setSeparado] = useState(() => tieneProductosIntercalados(paginas));
  const bloques = useMemo(() => bloquesDe(paginas, productos, separado), [paginas, productos, separado]);
  const [agregarEn, setAgregarEn] = useState<number | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);

  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previo; };
  }, []);

  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (agregarEn !== null) setAgregarEn(null);
      else alCerrar();
    };
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("keydown", escape); };
  }, [agregarEn, alCerrar]);

  function mover(id: string, destino: number) {
    alCambiar((actual) => moverBloque(actual, bloques, id, destino));
  }

  function separar() {
    alCambiar((actual) => separarPorMarcas(actual, productos, biblioteca, nuevoId));
    setSeparado(true);
  }

  const marcas = new Set(marcasDe(paginas, productos));
  const agregar = (f: FijaBiblioteca) => {
    const posicion = agregarEn ?? paginas.length;
    alCambiar((actual) => insertarFija(actual, f, posicion, nuevoId()));
    setAgregarEn(null);
  };

  return createPortal(
    <div className="dark fixed inset-0 z-50 overflow-y-auto bg-[#0e0f12] text-[#e8e8e8]" role="dialog" aria-modal="true" aria-label="Ordenar catálogo">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#2a2d35] bg-[#0e0f12]/95 px-4 py-3">
        <Button variant="outline" size="icon" onClick={alCerrar} aria-label="Cerrar vista de ordenar"><X /></Button>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Ordenar catálogo</h2>
          <p className="text-xs text-[#9aa0ab]">Arrastra bloques o usa las flechas. Agrega separadores y quita páginas fijas. Los cambios se guardan en el borrador.</p>
        </div>
        <Button className="ml-auto" size="sm" onClick={alCerrar}>Volver al editor</Button>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <ol>
          {bloques.map((bloque, i) => (
            <li key={bloque.id}>
              <div className={`group flex min-h-7 items-center justify-center rounded-md border border-dashed text-xs ${sobre === i ? "border-sky-400 bg-sky-400/10" : "border-transparent text-[#9aa0ab]"}`}
                onDragOver={(e) => { e.preventDefault(); setSobre(i); }} onDrop={(e) => { e.preventDefault(); if (arrastrando) mover(arrastrando, i); setArrastrando(null); setSobre(null); }}>
                <button type="button" className="opacity-70 hover:opacity-100" onClick={() => setAgregarEn(bloque.inicio)}><Plus className="inline h-3.5 w-3.5" /> Agregar página aquí</button>
              </div>
              <div draggable onDragStart={() => setArrastrando(bloque.id)} onDragEnd={() => { setArrastrando(null); setSobre(null); }}
                className={`flex items-center gap-3 rounded-xl border p-2.5 ${bloque.tipo === "fija" ? "border-[#2a2d35] bg-[#191c22]" : "border-sky-400/40 bg-sky-400/[0.06]"} ${arrastrando === bloque.id ? "opacity-50" : ""}`}>
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-[#9aa0ab]" />
                <span className="w-5 shrink-0 text-center text-xs text-[#9aa0ab]">{i + 1}</span>
                {bloque.tipo === "fija" ? <img src={`${base}/${(bloque.paginas[0] as PaginaFija).imagen}${biblioteca.some((f) => f.imagen === (bloque.paginas[0] as PaginaFija).imagen) ? "-min" : ""}.webp`} alt="" className="h-14 w-24 shrink-0 rounded-md object-cover" /> : bloque.tipo === "marca" ? <LogoMarca marca={bloque.marca ?? ""} /> : <div className="flex shrink-0 -space-x-6">{marcasDe(bloque.paginas, productos).slice(0, 3).map((marca) => <LogoMarca key={marca} marca={marca} />)}</div>}
                <div className="min-w-0 flex-1">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${bloque.tipo === "fija" ? "bg-white/10 text-[#c9ced8]" : "bg-sky-400/20 text-sky-200"}`}>{bloque.tipo === "fija" ? (biblioteca.find((f) => f.imagen === (bloque.paginas[0] as PaginaFija).imagen)?.tipo ?? "Página") : "Productos"}</span>
                  <p className="mt-1 truncate text-sm font-medium">{bloque.tipo === "fija" ? biblioteca.find((f) => f.imagen === (bloque.paginas[0] as PaginaFija).imagen)?.nombre ?? "Página con imagen" : bloque.tipo === "marca" ? bloque.marca : "Páginas de producto, por marca"}</p>
                  <p className="text-xs text-[#9aa0ab]">{bloque.paginas.length.toLocaleString("en-US")} {bloque.paginas.length === 1 ? "página" : "páginas"}</p>
                  {bloque.tipo === "productos" && marcas.size > 0 && <Button variant="outline" size="xs" className="mt-1" onClick={separar}><Rows3 data-icon="inline-start" /> Separar por marcas</Button>}
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Subir bloque ${i + 1}`} disabled={i === 0} onClick={() => mover(bloque.id, i - 1)}><ArrowUp /></Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Bajar bloque ${i + 1}`} disabled={i === bloques.length - 1} onClick={() => mover(bloque.id, i + 2)}><ArrowDown /></Button>
                {bloque.tipo === "fija" && <Button variant="ghost" size="icon-sm" aria-label={`Quitar bloque ${i + 1}`} onClick={() => alQuitar(bloque.id)}><Trash2 /></Button>}
              </div>
            </li>
          ))}
          <li><div className="flex min-h-9 items-center justify-center rounded-md border border-dashed border-[#2a2d35] text-xs text-[#9aa0ab]" onDragOver={(e) => { e.preventDefault(); setSobre(bloques.length); }} onDrop={(e) => { e.preventDefault(); if (arrastrando) mover(arrastrando, bloques.length); setArrastrando(null); setSobre(null); }}>
            <button type="button" onClick={() => setAgregarEn(paginas.length)}><Plus className="inline h-3.5 w-3.5" /> Agregar página al final</button>
          </div></li>
        </ol>
      </div>
      {agregarEn !== null && <SelectorPaginaFija
        base={base}
        biblioteca={biblioteca.filter((f) => !paginas.some((p) => p.tipo === "fija" && p.imagen === f.imagen) && (f.tipo !== "separador_marca" || marcas.has(f.marca?.trim().toUpperCase() ?? "")))}
        existentes={biblioteca}
        marcas={[...marcas]}
        modoSubida="ambos"
        tituloPosicion={agregarEn >= paginas.length ? "Se agregará al final del catálogo." : `Se agregará antes de la página ${agregarEn + 1}.`}
        alAgregar={(fija, _posicion, nueva) => {
          if (nueva && !fija.id.startsWith("paginas-fijas/")) alNuevaFija(fija);
          agregar(fija);
        }}
        alCerrar={() => setAgregarEn(null)}
      />}
    </div>, document.body
  );
}
