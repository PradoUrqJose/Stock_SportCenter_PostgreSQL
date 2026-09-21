import { sesionMarketing } from "@/lib/marketing";
import { libroDeTallas } from "@/lib/marketing-tallas-excel";
import { tablasDeTallas } from "@/lib/marketing-tallas-datos";

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** GET /api/marketing/tallas/exportar — las equivalencias actuales en el mismo formato de la plantilla (para editarlas y volver a subirlas). */
export async function GET() {
  if (!(await sesionMarketing())) return new Response("Sin permisos", { status: 403 });
  const buf = await libroDeTallas(await tablasDeTallas());
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": TIPO_XLSX, "Content-Disposition": 'attachment; filename="Equivalencias de tallas.xlsx"', "Cache-Control": "no-store" },
  });
}
