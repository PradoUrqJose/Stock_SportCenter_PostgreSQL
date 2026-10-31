import { requireMarketing } from "@/lib/marketing";
import { revisionImagenesConPendientes } from "@/lib/marketing-revision-imagenes";
import { ProductosSinImagen } from "@/components/admin/marketing/productos-sin-imagen";

export const maxDuration = 300;

export default async function SinImagenPage() {
  await requireMarketing();
  const revision = await revisionImagenesConPendientes();
  return (
    <ProductosSinImagen
      pendientes={revision.pendientes}
      total={revision.productos.length}
      consultadoAl={revision.consultadoAl}
      almacenes={revision.almacenes}
      consulta={revision.consulta}
    />
  );
}
