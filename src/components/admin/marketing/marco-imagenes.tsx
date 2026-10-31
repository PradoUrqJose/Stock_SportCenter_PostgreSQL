"use client";

import Link, { useLinkStatus } from "next/link";
import { createContext, useContext, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ImageOff, Images, Loader2 } from "lucide-react";
import { SubirImagenes } from "./subir-imagenes";
import { cn } from "@/lib/utils";

type VistaPendientes = "tabla" | "galeria";
const VistaContext = createContext<{
  vista: VistaPendientes;
  setVista: (vista: VistaPendientes) => void;
} | null>(null);

export function useVistaPendientes() {
  const contexto = useContext(VistaContext);
  if (!contexto)
    throw new Error("La vista debe estar dentro de Gestión de imágenes");
  return contexto;
}

function IndicadorNavegacion() {
  const { pending } = useLinkStatus();
  return (
    <Loader2
      aria-hidden
      className={cn("size-3.5 animate-spin", !pending && "invisible")}
    />
  );
}

/** Encabezado y pestañas persistentes: las cargas de rutas solo reemplazan el contenido. */
export function MarcoImagenes({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [vista, setVista] = useState<VistaPendientes>("tabla");
  const contexto = useMemo(() => ({ vista, setVista }), [vista]);
  return (
    <VistaContext.Provider value={contexto}>
      <section
        className="space-y-5 p-4 md:p-8"
        aria-label="Gestión de imágenes"
      >
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Imágenes</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Tu biblioteca y los productos pendientes, en un mismo lugar.
            </p>
          </div>
          <SubirImagenes />
        </header>
        <nav
          aria-label="Vistas de imágenes"
          className="flex gap-1 border-b border-border"
        >
          {[
            {
              href: "/admin/marketing/imagenes",
              texto: "Imágenes guardadas",
              Icono: Images,
            },
            {
              href: "/admin/marketing/imagenes/sin-imagen",
              texto: "Sin imagen",
              Icono: ImageOff,
            },
          ].map(({ href, texto, Icono }) => (
            <Link
              key={href}
              href={href}
              scroll={false}
              aria-current={pathname === href ? "page" : undefined}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-3 py-3 text-sm transition-colors",
                pathname === href
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icono className="size-4" />
              {texto}
              <IndicadorNavegacion />
            </Link>
          ))}
        </nav>
        <div id="contenido-imagenes">{children}</div>
      </section>
    </VistaContext.Provider>
  );
}
