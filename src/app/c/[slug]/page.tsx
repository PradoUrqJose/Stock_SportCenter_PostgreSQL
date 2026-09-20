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
  if (!snapshot) return { title: "Catálogo", robots: { index: false, follow: false } };

  // Vista previa del enlace (WhatsApp, Facebook, Telegram…): título, descripción e imagen de la portada.
  const titulo = `${snapshot.titulo} · Sport Center`;
  const descripcion = "Catálogo de Sport Center: modelos originales, tallas y precios sugeridos.";
  const imagen = snapshot.og ? `${snapshot.imagenes_base}/${snapshot.og}` : undefined;
  return {
    title: titulo,
    description: descripcion,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      title: titulo,
      description: descripcion,
      siteName: "Sport Center",
      locale: "es_PE",
      ...(imagen ? { images: [{ url: imagen, width: 1200, height: 630, alt: snapshot.titulo }] } : {}),
    },
    twitter: { card: imagen ? "summary_large_image" : "summary", title: titulo, description: descripcion, ...(imagen ? { images: [imagen] } : {}) },
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
