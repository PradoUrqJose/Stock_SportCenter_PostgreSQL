"use client";

// Vista a pantalla completa de las plantillas vacías de zapatilla, ordenadas por marca, para
// revisarlas en grande antes de acomodar la posición de la zapatilla.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MARCA_GENERICA, type PlantillaLista } from "@/lib/marketing-catalogo";

export function PreviewPlantillas({
  base,
  plantillas,
  alCerrar,
  alSiguiente,
}: {
  base: string;
  plantillas: PlantillaLista[];
  alCerrar: () => void;
  alSiguiente: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && alCerrar();
    document.addEventListener("keydown", h);
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", h);
      document.body.style.overflow = previo;
    };
  }, [alCerrar]);

  return createPortal(
    <div className="dark fixed inset-0 z-50 overflow-y-auto bg-[#0e0f12] text-[#e8e8e8] animate-in fade-in duration-300" role="dialog" aria-label="Preview de plantillas">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#2a2d35] bg-[#0e0f12]/90 px-4 py-3 backdrop-blur">
        <Button variant="outline" size="icon" onClick={alCerrar} aria-label="Cerrar preview">
          <X />
        </Button>
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold">Preview de plantillas</h2>
          <p className="text-xs text-[#9aa0ab]">{plantillas.length} plantillas vacías, ordenadas por marca</p>
        </div>
        <Button className="ml-auto" onClick={alSiguiente}>
          Siguiente: acomodar la zapatilla <ArrowRight data-icon="inline-end" />
        </Button>
      </header>
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        {plantillas.map((p, i) => (
          <figure key={p.id} className="animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-500" style={{ animationDelay: `${Math.min(i, 5) * 70}ms` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${base}/${p.fondo}.webp`} alt={`Plantilla ${p.nombre}`} loading={i < 2 ? "eager" : "lazy"} decoding="async" className="w-full rounded-lg border border-[#2a2d35]" style={{ aspectRatio: `${p.ancho} / ${p.alto}` }} />
            <figcaption className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{p.marca === MARCA_GENERICA ? "Genérica" : p.marca}</span>
              <span className="text-[#9aa0ab]">{p.nombre}</span>
              {p.predeterminada && <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-400">predeterminada</span>}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>,
    document.body
  );
}
