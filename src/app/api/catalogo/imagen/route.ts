import { claveImagenPdfValida } from "@/lib/marketing-pdf-imagen";

export const maxDuration = 30;
const MAX_BYTES = 4 * 1024 * 1024;

/** Respaldo de lectura para el PDF: solo imágenes ya públicas del bucket configurado. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const clave = q.get("clave") ?? "";
  if (!claveImagenPdfValida(clave)) return new Response("Imagen inválida", { status: 400 });
  const base = (process.env.R2_PUBLIC_URL ?? "https://img.sportcenterpe.com").replace(/\/+$/, "");
  const url = new URL(`${base}/${clave.split("/").map(encodeURIComponent).join("/")}`);
  const revision = q.get("v");
  if (revision && /^\d{1,15}$/.test(revision)) url.searchParams.set("v", revision);
  try {
    const r = await fetch(url, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(15_000)]),
    });
    if (!r.ok) return new Response("No se pudo leer la imagen", {
      status: r.status === 404 ? 404 : 502,
      headers: { "Cache-Control": "no-store" },
    });
    if (Number(r.headers.get("content-length")) > MAX_BYTES) {
      await r.body?.cancel();
      return new Response("Imagen demasiado grande", { status: 413 });
    }
    const bytes = await r.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) return new Response("Imagen demasiado grande", { status: 413 });
    return new Response(bytes, { headers: {
      "Content-Type": clave.endsWith(".jpg") ? "image/jpeg" : "image/webp",
      "Cache-Control": "public, max-age=300, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return new Response("No se pudo conectar con el servidor de imágenes", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
