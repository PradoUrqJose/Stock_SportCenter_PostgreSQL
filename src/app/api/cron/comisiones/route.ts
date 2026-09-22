import { revalidatePath } from "next/cache";
import { guardarComisiones, type ComisionVenta } from "@/lib/comisiones-sync";

function hoyLima() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}
function fechaErp(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Vercel llama esta ruta cada noche. CRON_SECRET evita que pueda ejecutarla
 * cualquier visitante; el mismo secreto ya protege al scraper de Python. */
export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const syncSecret = process.env.SYNC_SECRET;
  if (!syncSecret) return Response.json({ error: "Falta SYNC_SECRET" }, { status: 500 });

  const fecha = hoyLima();
  try {
    const response = await fetch(new URL("/api/comisiones", request.url), {
      method: "POST",
      headers: {
        "X-Sync-Secret": syncSecret,
        "X-Comisiones-Inicio": fechaErp(fecha),
        "X-Comisiones-Fin": fechaErp(fecha),
      },
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? `El ERP respondió ${response.status}`);
    const guardado = await guardarComisiones({ inicio: fecha, fin: fecha, ventas: (body.ventas ?? []) as ComisionVenta[] });
    revalidatePath("/admin/analisis/comisiones");
    return Response.json({ fecha, ...guardado });
  } catch (error) {
    console.error("[cron comisiones]", error);
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo sincronizar" }, { status: 500 });
  }
}
