import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Montserrat } from "next/font/google";
import { preconnect, preload } from "react-dom";
import { obtenerSnapshotPublicado } from "@/lib/marketing-publico";
import { VisorCatalogo } from "@/components/catalogo/visor-catalogo";

// Ruta PÚBLICA (sin sesión): el enlace que se envía a los clientes. Solo lee el
// snapshot publicado; no muestra nada interno (ni cantidades ni precio de compra).
// En el dominio de clientes llega reescrita desde /<slug> (ver src/proxy.ts).

// Tipografía del diseño (provisional hasta que Marketing entregue la definitiva).
const montserrat = Montserrat({ subsets: ["latin"], weight: "900", display: "swap" });

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const snapshot = await obtenerSnapshotPublicado(slug);
  return {
    title: snapshot?.titulo ?? "Catálogo",
    robots: { index: false, follow: false },
  };
}

export default async function CatalogoPublicoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const snapshot = await obtenerSnapshotPublicado(slug);
  if (!snapshot) notFound();

  // Abre la conexión a R2 y pide el fondo antes de que el navegador ejecute el visor.
  preconnect(new URL(snapshot.imagenes_base).origin);
  const primeraProducto = snapshot.paginas.find((p) => p.tipo === "producto");
  const primera = primeraProducto?.tipo === "producto" ? snapshot.plantillas[primeraProducto.plantilla] : undefined;
  if (primera) preload(`${snapshot.imagenes_base}/${primera.fondo}.webp`, { as: "image" });

  return (
    <div className={montserrat.className}>
      <VisorCatalogo snapshot={snapshot} fuente={montserrat.style.fontFamily} />
    </div>
  );
}
