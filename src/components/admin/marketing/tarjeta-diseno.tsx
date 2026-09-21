"use client";

// Tarjeta de un diseño (miniatura, nombre, insignias y acciones); se abre en grande con un clic.
import { Button } from "@/components/ui/button";

export function TarjetaDiseno({
  src,
  nombre,
  insignias,
  alAbrir,
  children,
}: {
  src: string;
  nombre: string;
  insignias: (string | false | null)[];
  alAbrir: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="group overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
      <button type="button" onClick={alAbrir} className="block w-full overflow-hidden" aria-label={`Ver ${nombre} en grande`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" loading="lazy" decoding="async" className="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
      </button>
      <div className="space-y-1.5 px-2.5 py-2">
        <p className="truncate text-xs font-medium text-foreground" title={nombre}>
          {nombre}
        </p>
        <div className="flex flex-wrap gap-1">
          {insignias.filter((x): x is string => Boolean(x)).map((t) => (
            <span key={t} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
        {children && <div className="space-y-2 border-t border-border pt-2">{children}</div>}
      </div>
    </div>
  );
}

/** Acción de una tarjeta: un botón de verdad (con borde), para que se note que se puede pulsar. */
export function AccionMini({ onClick, icono, children }: { onClick: () => void; icono?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      {icono && <span data-icon="inline-start">{icono}</span>}
      {children}
    </Button>
  );
}
