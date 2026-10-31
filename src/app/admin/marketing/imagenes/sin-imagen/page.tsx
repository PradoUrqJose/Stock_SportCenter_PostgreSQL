import { db } from "@/lib/db";
import { requireMarketing } from "@/lib/marketing";
import { datosRevisionImagenes } from "@/lib/marketing-revision-imagenes";
import { sinImagenRegistrada } from "@/lib/marketing-imagenes-pendientes";
import { ProductosSinImagen } from "@/components/admin/marketing/productos-sin-imagen";

export const maxDuration = 300;

export default async function SinImagenPage() {
  await requireMarketing();
  const [revision, imagenes] = await Promise.all([
    datosRevisionImagenes(),
    db.execute("SELECT cod_universal FROM mk_imagenes WHERE version > 0"),
  ]);
  const pendientes = sinImagenRegistrada(
    revision.productos,
    imagenes.rows.map((r) => r.cod_universal as string),
  );
  return (
    <ProductosSinImagen
      pendientes={pendientes}
      total={revision.productos.length}
      consultadoAl={revision.consultadoAl}
      almacenes={revision.almacenes}
      consulta={revision.consulta}
    />
  );
}
