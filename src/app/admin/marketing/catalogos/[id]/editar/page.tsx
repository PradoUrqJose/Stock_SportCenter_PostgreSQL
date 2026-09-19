import { notFound } from "next/navigation";
import { Montserrat } from "next/font/google";
import { preconnect } from "react-dom";
import { db } from "@/lib/db";
import { IMAGENES_BASE, ORIGEN_IMAGENES, enlacesCatalogo, requireMarketing } from "@/lib/marketing";
import { plantillasPorId, sincronizarVersiones } from "@/lib/marketing-catalogos-datos";
import type { Borrador } from "@/lib/marketing-catalogo";
import { EditorCatalogo } from "@/components/catalogo/editor-catalogo";

// Misma tipografía provisional que el visor público (hasta tener la definitiva).
const montserrat = Montserrat({ subsets: ["latin"], weight: "900", display: "swap" });

type Fila = {
  slug: string;
  titulo: string;
  borrador: string;
  version_publicada: number | null;
  updated_at: string;
};

/** Editor del catálogo (borrador). Solo para usuarios con el módulo MARKETING. */
export default async function EditarCatalogoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ publicado?: string }>;
}) {
  await requireMarketing();
  preconnect(ORIGEN_IMAGENES);
  const { id } = await params;
  const { publicado } = await searchParams;

  const c = await db.execute({
    sql: "SELECT slug, titulo, borrador, version_publicada, updated_at FROM mk_catalogos WHERE id = ?",
    args: [id],
  });
  if (c.rows.length === 0) notFound();
  const cat = c.rows[0] as unknown as Fila;

  // Imágenes reemplazadas después de generar el catálogo: se muestran con su versión vigente.
  const borrador = await sincronizarVersiones(JSON.parse(cat.borrador) as Borrador);
  const quitadas = borrador.quitadas ?? [];

  const usadas = [...borrador.paginas, ...quitadas].flatMap((p) => (p.tipo === "producto" ? [p.plantilla] : []));
  const plantillas = await plantillasPorId([...new Set(usadas)]);

  // «Cambios sin publicar»: hubo ediciones después de la última publicación.
  let sinPublicar = false;
  if (cat.version_publicada) {
    const v = await db.execute({
      sql: "SELECT publicado_at FROM mk_catalogo_versiones WHERE catalogo_id = ? AND version = ?",
      args: [id, cat.version_publicada],
    });
    sinPublicar = v.rows.length > 0 && cat.updated_at > (v.rows[0].publicado_at as string);
  }

  return (
    <div className={montserrat.className}>
      <EditorCatalogo
        id={id}
        titulo={cat.titulo}
        base={IMAGENES_BASE}
        fuente={montserrat.style.fontFamily}
        plantillas={plantillas}
        productosIniciales={borrador.productos}
        paginasIniciales={borrador.paginas}
        quitadasIniciales={quitadas}
        versionInicial={cat.version_publicada}
        sinPublicarInicial={sinPublicar}
        enlacesIniciales={cat.version_publicada ? await enlacesCatalogo(cat.slug) : null}
        mensajeInicial={
          publicado && publicado === String(cat.version_publicada)
            ? `Versión ${publicado} publicada: los clientes ya la ven en el mismo enlace.`
            : undefined
        }
      />
    </div>
  );
}
