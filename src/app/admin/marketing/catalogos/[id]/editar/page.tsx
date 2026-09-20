import { notFound, redirect } from "next/navigation";
import { Montserrat } from "next/font/google";
import { preconnect } from "react-dom";
import { db } from "@/lib/db";
import { IMAGENES_BASE, ORIGEN_IMAGENES, enlacesCatalogo, requireMarketing } from "@/lib/marketing";
import { borradorDeVersion, fijasDeBiblioteca, plantillasPorId, sincronizarVersiones } from "@/lib/marketing-catalogos-datos";
import type { Borrador } from "@/lib/marketing-catalogo";
import { EditorCatalogo } from "@/components/catalogo/editor-catalogo";

// Misma tipografía provisional que el visor público (hasta tener la definitiva).
const montserrat = Montserrat({ subsets: ["latin"], weight: "900", display: "swap" });

type Fila = {
  slug: string;
  titulo: string;
  borrador: string;
  version_publicada: number | null;
};

/**
 * Editor de una versión del catálogo (`?version=N`); sin versión, el borrador
 * inicial de un catálogo que aún no se publicó. Solo para usuarios con el módulo MARKETING.
 */
export default async function EditarCatalogoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string; publicado?: string }>;
}) {
  await requireMarketing();
  preconnect(ORIGEN_IMAGENES);
  const { id } = await params;
  const { version, publicado } = await searchParams;

  const c = await db.execute({
    sql: "SELECT slug, titulo, borrador, version_publicada FROM mk_catalogos WHERE id = ?",
    args: [id],
  });
  if (c.rows.length === 0) notFound();
  const cat = c.rows[0] as unknown as Fila;

  // Un catálogo publicado siempre se edita desde una versión: sin `version` se abre la vigente.
  if (version === undefined && cat.version_publicada) {
    redirect(`/admin/marketing/catalogos/${id}/editar?version=${cat.version_publicada}`);
  }
  const versionBase = version === undefined ? null : Number(version);
  if (versionBase !== null && !Number.isInteger(versionBase)) notFound();

  let partida: Borrador;
  let sinPublicar = false;
  if (versionBase === null) {
    partida = JSON.parse(cat.borrador) as Borrador;
  } else {
    const v = await borradorDeVersion(id, versionBase);
    if (!v) notFound();
    partida = v.borrador;
    sinPublicar = v.conCambios;
  }

  // Imágenes reemplazadas después de generar el catálogo: se muestran con su versión vigente.
  const borrador = await sincronizarVersiones(partida);
  const quitadas = borrador.quitadas ?? [];

  const usadas = [...borrador.paginas, ...quitadas].flatMap((p) => (p.tipo === "producto" ? [p.plantilla] : []));
  const [plantillas, biblioteca] = await Promise.all([plantillasPorId([...new Set(usadas)]), fijasDeBiblioteca()]);

  return (
    <div className={montserrat.className}>
      <EditorCatalogo
        key={versionBase ?? "borrador"}
        id={id}
        titulo={cat.titulo}
        base={IMAGENES_BASE}
        fuente={montserrat.style.fontFamily}
        plantillas={plantillas}
        productosIniciales={borrador.productos}
        paginasIniciales={borrador.paginas}
        quitadasIniciales={quitadas}
        biblioteca={biblioteca}
        versionBase={versionBase}
        versionVigente={cat.version_publicada}
        sinPublicarInicial={sinPublicar}
        enlacesIniciales={cat.version_publicada ? await enlacesCatalogo(cat.slug) : null}
        mensajeInicial={
          publicado && publicado === String(versionBase)
            ? `Versión ${publicado} publicada: los clientes ya la ven en el mismo enlace.`
            : undefined
        }
      />
    </div>
  );
}
