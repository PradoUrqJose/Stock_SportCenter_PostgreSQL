"use client";

import { ImagePlus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { codigoValido } from "@/lib/marketing-codigos";
import type { ProductoRevisionImagen } from "@/lib/marketing-imagenes-pendientes";
import { rutaLogoMarca } from "@/components/catalogo/ordenar-catalogo-logica";
import logos from "../../../../public/marcas/fuentes.json";
import { cn } from "@/lib/utils";

function Marca({ producto }: { producto: ProductoRevisionImagen }) {
  const marca = producto.marcas[0] ?? "";
  const logo = rutaLogoMarca(marca, logos);
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-black/5 bg-white p-1.5 text-xs font-semibold text-slate-600">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt={marca}
          className="size-full object-contain"
          loading="lazy"
        />
      ) : (
        marca.slice(0, 2) || "—"
      )}
    </span>
  );
}

function Edades({ producto }: { producto: ProductoRevisionImagen }) {
  return (
    <div className="flex flex-wrap gap-1">
      {(producto.generos.length ? producto.generos : ["Sin género"]).map(
        (g) => (
          <span
            key={g}
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              g === "INFANTE" || g === "PRESCO" || g === "JUNIOR"
                ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                : "bg-muted text-muted-foreground",
            )}
          >
            {g}
          </span>
        ),
      )}
    </div>
  );
}

function Stock({ producto }: { producto: ProductoRevisionImagen }) {
  return producto.stock === null ? (
    <span
      className="text-[11px] text-amber-700 dark:text-amber-400"
      title="El ERP repite una ficha de este código y edad. No se suman cantidades ambiguas."
    >
      Por revisar
    </span>
  ) : (
    <span className="inline-flex items-baseline gap-1 rounded-md bg-muted/70 px-2 py-1">
      <strong className="text-sm font-semibold tabular-nums">
        {producto.stock.toLocaleString("en-US")}
      </strong>
      <span className="text-[10px] text-muted-foreground">uds.</span>
    </span>
  );
}

type Props = {
  productos: ProductoRevisionImagen[];
  seleccionar: (p: ProductoRevisionImagen) => void;
};

export function TablaProductosSinImagen({ productos, seleccionar }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-left text-sm">
        <thead className="border-b border-border bg-muted/30 text-[11px] text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Producto
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Detalles
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Género / edad
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Stock ERP
            </th>
            <th scope="col" className="w-36 px-4 py-2.5">
              <span className="sr-only">Acción</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {productos.map((p) => (
            <tr
              key={p.codigo}
              className="group transition-colors hover:bg-muted/30"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Marca producto={p} />
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold tracking-tight">
                      {p.codigo}
                    </p>
                    <p className="mt-0.5 max-w-72 text-xs text-foreground/80">
                      {p.modelos.join(" / ") || "Sin modelo"}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {p.marcas.join(" / ") || "Sin marca"}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {p.categorias.map((c) => (
                    <span
                      key={c}
                      className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {c}
                    </span>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {p.colores.join(" / ") || "Sin color"}
                </p>
              </td>
              <td className="px-4 py-3">
                <Edades producto={p} />
              </td>
              <td className="px-4 py-3 text-right">
                <Stock producto={p} />
              </td>
              <td className="px-4 py-3 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-xs text-muted-foreground group-hover:bg-background group-hover:text-foreground"
                  aria-label={`Subir imagen de ${p.codigo}`}
                  disabled={!codigoValido(p.codigo)}
                  onClick={() => seleccionar(p)}
                >
                  <Upload className="size-3.5" /> Agregar imagen
                </Button>
                {!codigoValido(p.codigo) && (
                  <p className="text-[10px] text-destructive">
                    Revisar código en ERP
                  </p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GaleriaProductosSinImagen({ productos, seleccionar }: Props) {
  return (
    <div
      aria-label="Galería de productos sin imagen"
      className="grid grid-cols-1 gap-3 p-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
    >
      {productos.map((p) => (
        <article
          key={p.codigo}
          className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-sm"
        >
          <div className="flex items-center justify-between gap-2 p-3 pb-2">
            <div className="flex min-w-0 items-center gap-2">
              <Marca producto={p} />
              <span className="truncate text-[10px] font-medium text-muted-foreground">
                {p.marcas.join(" / ") || "Sin marca"}
              </span>
            </div>
            <Stock producto={p} />
          </div>
          <button
            type="button"
            aria-label={`Subir imagen de ${p.codigo}`}
            disabled={!codigoValido(p.codigo)}
            onClick={() => seleccionar(p)}
            className="mx-3 flex h-24 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/20 text-muted-foreground transition-colors group-hover:border-amber-500/40 group-hover:bg-amber-500/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
          >
            <ImagePlus className="size-6 stroke-[1.4]" />
            <span className="text-[11px]">Agregar imagen</span>
          </button>
          <div className="flex flex-1 flex-col gap-2 p-3">
            <div>
              <p className="font-mono text-xs font-semibold">{p.codigo}</p>
              <p className="mt-1 line-clamp-2 min-h-8 text-xs text-foreground/80">
                {p.modelos.join(" / ") || "Sin modelo"}
              </p>
            </div>
            <Edades producto={p} />
            <div className="mt-auto flex flex-wrap gap-x-2 gap-y-1 border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
              <span>{p.categorias.join(" / ") || "Sin categoría"}</span>
              {p.colores.length > 0 && (
                <span className="truncate">{p.colores.join(" / ")}</span>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
