import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireMarketing } from "@/lib/marketing";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Fila = {
  id: string;
  titulo: string;
  version_publicada: number | null;
  paginas: number;
  updated_at: string;
};

export default async function CatalogosPage() {
  await requireMarketing();

  const r = await db.execute(
    `SELECT c.id, c.titulo, c.version_publicada, c.updated_at,
            COALESCE(v.paginas, (c.borrador::jsonb -> 'resumen' ->> 'paginas')::int) AS paginas
     FROM mk_catalogos c
     LEFT JOIN mk_catalogo_versiones v ON v.catalogo_id = c.id AND v.version = c.version_publicada
     ORDER BY c.created_at DESC`
  );
  const catalogos = r.rows as unknown as Fila[];

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Catálogos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Un clic abre el catálogo con sus versiones, y desde ahí eliges cuál editar. Cada catálogo tiene un enlace fijo para los clientes: al publicar una versión nueva, el mismo enlace la muestra.
          </p>
        </div>
        <Link href="/admin/marketing/catalogos/nuevo" className={cn(buttonVariants())}>
          <Plus data-icon="inline-start" /> Nuevo catálogo
        </Link>
      </div>

      {catalogos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Todavía no hay catálogos. Crea el primero con «Nuevo catálogo».
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {catalogos.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/marketing/catalogos/${c.id}`} className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{c.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.paginas?.toLocaleString("en-US")} páginas · actualizado {c.updated_at.slice(0, 16).replace("T", " ")}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                    c.version_publicada
                      ? "bg-green-500/15 text-green-700 dark:text-green-400"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {c.version_publicada ? `Publicado v${c.version_publicada}` : "Borrador"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
