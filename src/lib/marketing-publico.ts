// Lectura del catálogo publicado para el visor público. Es lo ÚNICO que toca la
// base de datos en una visita de cliente, y va en caché: el snapshot de una
// versión es inmutable, así que solo se vuelve a leer cuando se publica (la
// acción publicarCatalogo invalida la etiqueta con updateTag).
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import type { Snapshot } from "@/lib/marketing-catalogo";

export const etiquetaCatalogo = (slug: string) => `mk-catalogo-${slug}`;

// `cache` de React: generateMetadata y la página lo piden en la misma visita y así comparten un solo resultado.
export const obtenerSnapshotPublicado = cache(async (slug: string): Promise<Snapshot | null> => {
  // Los slugs válidos son cortos y alfanuméricos: se rechaza todo lo demás sin ir a la BD.
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(slug)) return null;

  return unstable_cache(
    async () => {
      const r = await db.execute({
        sql: `SELECT v.snapshot
              FROM mk_catalogos c
              JOIN mk_catalogo_versiones v
                ON v.catalogo_id = c.id AND v.version = c.version_publicada
              WHERE c.slug = ?`,
        args: [slug],
      });
      return r.rows[0] ? (JSON.parse(r.rows[0].snapshot as string) as Snapshot) : null;
    },
    ["mk-snapshot", slug],
    { tags: [etiquetaCatalogo(slug)] }
  )();
});
