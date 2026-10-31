import { sesionMarketing } from "@/lib/marketing";
import { revisionImagenesConPendientes } from "@/lib/marketing-revision-imagenes";
import { filtrarRevisionImagen } from "@/lib/marketing-imagenes-pendientes";
import { excelProductosSinImagen } from "@/lib/marketing-imagenes-excel";

export const maxDuration = 120;

export async function GET(req: Request) {
  if (!(await sesionMarketing()))
    return new Response("Sin permisos", { status: 403 });
  const q = new URL(req.url).searchParams;
  const orden = q.get("orden");
  let revision;
  try {
    revision = await revisionImagenesConPendientes();
  } catch (e) {
    console.error("[marketing] no se pudo verificar R2 para el Excel", e);
    return new Response("No se pudo verificar el inventario de imágenes en R2. Vuelve a intentar la exportación.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const productos = filtrarRevisionImagen(revision.pendientes, {
    q: (q.get("q") ?? "").slice(0, 120),
    marca: q.get("marca") ?? "",
    genero: q.get("genero") ?? "",
    categoria: q.get("categoria") ?? "",
    orden: orden === "codigo" || orden === "marca" ? orden : "stock",
  });
  const bytes = await excelProductosSinImagen(productos, {
    fecha: revision.consultadoAl,
    almacenes: revision.almacenes,
    imagenesVerificadasAl: revision.imagenesVerificadasAl,
  });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Productos sin imagen.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
