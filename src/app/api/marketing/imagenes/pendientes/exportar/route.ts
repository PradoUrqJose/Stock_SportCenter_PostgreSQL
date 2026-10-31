import { sesionMarketing } from "@/lib/marketing";
import { revisionImagenesConPendientes } from "@/lib/marketing-revision-imagenes";
import { filtrarRevisionImagen } from "@/lib/marketing-imagenes-pendientes";
import { excelProductosSinImagen } from "@/lib/marketing-imagenes-excel";

export async function GET(req: Request) {
  if (!(await sesionMarketing()))
    return new Response("Sin permisos", { status: 403 });
  const q = new URL(req.url).searchParams;
  const orden = q.get("orden");
  const revision = await revisionImagenesConPendientes();
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
