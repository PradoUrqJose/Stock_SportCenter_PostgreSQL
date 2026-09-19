import Link from "next/link";
import { preconnect } from "react-dom";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { db } from "@/lib/db";
import {
  ORIGEN_IMAGENES,
  requireMarketing,
  urlImagenMiniatura,
  urlImagenOriginal,
} from "@/lib/marketing";
import { ImagenCard } from "@/components/admin/marketing/imagen-card";
import { SubirImagenes } from "@/components/admin/marketing/subir-imagenes";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const POR_PAGINA = 48;

type Fila = {
  cod_universal: string;
  version: number;
  imagen_url: string | null;
  marca: string | null;
  modelo: string | null;
  total: number;
};

function primero(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

// Escapa los comodines de LIKE para que "50%" o "A_B" se busquen literalmente.
function patronLike(q: string): string {
  return `%${q.replace(/[\\%_]/g, "\\$&")}%`;
}

function href(q: string, pagina: number): string {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (pagina > 1) p.set("pagina", String(pagina));
  const s = p.toString();
  return s ? `/admin/marketing/imagenes?${s}` : "/admin/marketing/imagenes";
}

export default async function ImagenesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireMarketing();
  // Abre la conexión a R2 mientras la consulta a la BD sigue en curso.
  preconnect(ORIGEN_IMAGENES);

  const sp = await searchParams;
  const q = primero(sp.q).trim().slice(0, 60);
  const pagina = Math.max(1, parseInt(primero(sp.pagina), 10) || 1);
  const like = patronLike(q);

  // productos tiene una fila por (cod_universal, genero): se colapsa a una por código.
  const result = await db.execute({
    sql: `SELECT m.cod_universal, m.version, m.imagen_url, p.marca, p.modelo,
                 COUNT(*) OVER () AS total
          FROM mk_imagenes m
          LEFT JOIN (
            SELECT UPPER(cod_universal) AS cod, MIN(marca) AS marca, MIN(modelo) AS modelo
            FROM productos
            GROUP BY UPPER(cod_universal)
          ) p ON p.cod = m.cod_universal
          WHERE ? = '' OR m.cod_universal LIKE ? OR p.marca ILIKE ? OR p.modelo ILIKE ?
          ORDER BY m.cod_universal
          LIMIT ? OFFSET ?`,
    args: [q, like, like, like, POR_PAGINA, (pagina - 1) * POR_PAGINA],
  });
  const filas = result.rows as unknown as Fila[];

  const total = filas[0]?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Imágenes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {q
              ? `${total.toLocaleString("en-US")} resultados para “${q}”.`
              : "Imágenes de producto guardadas en R2 (PNG transparente, 1600×1600). Haz clic en una para reemplazarla."}
          </p>
        </div>
        <SubirImagenes />
      </div>

      <form action="/admin/marketing/imagenes" className="mb-6 flex max-w-md gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Código, marca o modelo…"
            className="pl-8"
            autoComplete="off"
          />
        </div>
        <Button type="submit">Buscar</Button>
        {q && (
          <Link href="/admin/marketing/imagenes" className={cn(buttonVariants({ variant: "outline" }))}>
            Limpiar
          </Link>
        )}
      </form>

      {filas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {total === 0 && pagina === 1
            ? q
              ? "Ninguna imagen coincide con la búsqueda."
              : "Aún no hay imágenes registradas."
            : "Esa página no existe."}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {filas.map((f, i) => (
              <ImagenCard
                key={`${f.cod_universal}-${f.version}`}
                codigo={f.cod_universal}
                version={f.version}
                urlMiniatura={urlImagenMiniatura(f.cod_universal, f.version)}
                urlOriginal={urlImagenOriginal(f.cod_universal, f.version, f.imagen_url)}
                prioridad={i < 12}
                detalle={[f.marca, f.modelo].filter(Boolean).join(" · ") || null}
              />
            ))}
          </div>

          <nav className="mt-6 flex items-center justify-between text-sm text-muted-foreground" aria-label="Paginación">
            <span>
              Página {pagina.toLocaleString("en-US")} de {paginas.toLocaleString("en-US")}
            </span>
            <div className="flex gap-2">
              {pagina > 1 ? (
                <Link href={href(q, pagina - 1)} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                  <ChevronLeft /> Anterior
                </Link>
              ) : null}
              {pagina < paginas ? (
                <Link href={href(q, pagina + 1)} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                  Siguiente <ChevronRight />
                </Link>
              ) : null}
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
