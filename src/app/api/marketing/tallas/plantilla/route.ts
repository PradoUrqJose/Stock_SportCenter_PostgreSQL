import { sesionMarketing } from "@/lib/marketing";
import { libroDeTallas } from "@/lib/marketing-tallas-excel";

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** GET /api/marketing/tallas/plantilla — el Excel VACÍO para llenar las equivalencias de tallas. */
export async function GET() {
  if (!(await sesionMarketing())) return new Response("Sin permisos", { status: 403 });
  const buf = await libroDeTallas([]);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": TIPO_XLSX, "Content-Disposition": 'attachment; filename="Equivalencias de tallas - plantilla.xlsx"', "Cache-Control": "no-store" },
  });
}
