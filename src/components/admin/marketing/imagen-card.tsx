"use client";

import { useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AJEDREZ, ReemplazarImagen } from "./reemplazar-imagen";

type Props = {
  codigo: string;
  /** Derivado WebP liviano para la grilla. */
  urlMiniatura: string;
  /** PNG original: respaldo si el derivado no existe, y vista ampliada. */
  urlOriginal: string;
  version: number;
  detalle: string | null;
  /** Primeras de la página: se piden ya y con prioridad en vez de diferidas. */
  prioridad?: boolean;
};

export function ImagenCard({ codigo, urlMiniatura, urlOriginal, version, detalle, prioridad }: Props) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [src, setSrc] = useState(urlMiniatura);

  // El HTML llega con el <img> ya en marcha: si la imagen termina de bajar antes
  // de que React hidrate, onLoad/onError se pierden y quedaría oculta. Al montar
  // se revisa si ya terminó (bien o con error).
  const ref = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img?.complete) return;
      if (img.naturalWidth > 0) setLoaded(true);
      else if (img.currentSrc !== "") setSrc((s) => (s !== urlOriginal ? urlOriginal : s));
    },
    [urlOriginal]
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group overflow-hidden rounded-lg border border-border bg-card text-left transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <div className={cn("relative aspect-square", AJEDREZ)}>
          {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={ref}
            src={src}
            alt={codigo}
            loading={prioridad ? "eager" : "lazy"}
            fetchPriority={prioridad ? "high" : "auto"}
            decoding="async"
            className={cn(
              "h-full w-full object-contain transition-opacity duration-100",
              loaded ? "opacity-100" : "opacity-0"
            )}
            onLoad={() => setLoaded(true)}
            onError={() => {
              // Derivado inexistente → PNG original. Si el original también falla, se deja de esperar.
              if (src !== urlOriginal) setSrc(urlOriginal);
              else setLoaded(true);
            }}
          />
        </div>
        <div className="px-2.5 py-2">
          <p className="font-mono text-xs font-medium text-foreground">{codigo}</p>
          <p className="truncate text-xs text-muted-foreground">{detalle ?? "Sin producto en el ERP"}</p>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono">{codigo}</DialogTitle>
            <DialogDescription>
              {detalle ?? "Sin producto en el ERP"} · versión {version}
            </DialogDescription>
          </DialogHeader>
          {open && (
            <ReemplazarImagen codigo={codigo} urlActual={urlOriginal} onHecho={() => setOpen(false)} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
