"use client";

// Vista a pantalla completa del DOCUMENTO del catálogo: la portada, la plantilla vacía de cada marca, los
// separadores sugeridos y los cierres (términos, redes), en el orden en que saldrán. Desde aquí se sigue al
// paso de acomodar la zapatilla.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Hoja } from "./documento-catalogo";

export function PreviewPlantillas({
  base,
  hojas,
  alCerrar,
  alSiguiente,
}: {
  base: string;
  hojas: Hoja[];
  alCerrar: () => void;
  alSiguiente?: () => void;
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
    <div className="dark fixed inset-0 z-50 overflow-y-auto bg-[#0e0f12] text-[#e8e8e8] animate-in fade-in duration-300" role="dialog" aria-label="Preview del documento">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#2a2d35] bg-[#0e0f12]/90 px-4 py-3 backdrop-blur">
        <Button variant="outline" size="icon" onClick={alCerrar} aria-label="Cerrar preview">
          <X />
        </Button>
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold">Preview del documento</h2>
          <p className="text-xs text-[#9aa0ab]">{hojas.length} hojas en el orden en que saldrán; las plantillas de marca se repiten con cada producto</p>
        </div>
        {alSiguiente ? (
          <Button className="ml-auto" onClick={alSiguiente}>
            Siguiente: acomodar la zapatilla <ArrowRight data-icon="inline-end" />
          </Button>
        ) : (
          <p className="ml-auto text-xs text-amber-400">Elige una portada (o «Sin portada») para continuar</p>
        )}
      </header>
      <div className="mx-auto max-w-5xl space-y-9 px-4 py-8">
        {hojas.length === 0 && <p className="rounded-lg border border-dashed border-[#2a2d35] p-8 text-center text-sm text-[#9aa0ab]">No hay diseños para estos filtros: vuelve al paso anterior.</p>}
        {hojas.map((h, i) => (
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
    </div>,
    document.body
  );
}
