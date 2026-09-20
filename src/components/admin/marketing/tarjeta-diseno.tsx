"use client";

// Tarjeta de un diseño (miniatura, nombre, insignias y acciones); se abre en grande con un clic.
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
        {children && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">{children}</div>}
      </div>
    </div>
  );
}

export function AccionMini({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline">
      {children}
    </button>
  );
}
