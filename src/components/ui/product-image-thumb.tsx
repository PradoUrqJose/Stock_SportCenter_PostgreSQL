"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Props = {
  imagenUrl: string | null | undefined;
  codigo: string;
  label?: string;
};

/** Read-only product thumbnail for tables — click opens a larger preview. Use the admin editor's own cell when edit capability is needed. */
export function ProductImageThumb({ imagenUrl, codigo, label }: Props) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => imagenUrl && setOpen(true)}
        disabled={!imagenUrl}
        title={imagenUrl ? "Ver imagen" : "Sin imagen"}
        className="relative mx-auto block h-10 w-10 overflow-hidden rounded disabled:cursor-default"
      >
        {imagenUrl ? (
          <>
            {!loaded && <Skeleton className="absolute inset-0 h-10 w-10 rounded" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagenUrl}
              alt={codigo}
              className={cn("h-10 w-10 object-cover transition-opacity", loaded ? "opacity-100" : "opacity-0")}
              onLoad={() => setLoaded(true)}
              onError={() => setLoaded(true)}
            />
          </>
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded bg-gray-50 text-gray-300">
            <ImageOff className="h-4 w-4" />
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{codigo}</DialogTitle>
            {label && <DialogDescription>{label}</DialogDescription>}
          </DialogHeader>
          {imagenUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imagenUrl}
              alt={codigo}
              className="mx-auto max-h-[60vh] w-auto rounded object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
