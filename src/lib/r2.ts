// Cliente mínimo de Cloudflare R2 (API compatible con S3) — SOLO servidor:
// nunca importarlo desde un componente "use client" (lee credenciales).
// Usa aws4fetch (~6 KB, firma SigV4 sobre fetch) en vez del SDK de AWS, que
// pesaría mucho más en cada arranque en frío de Vercel.
//
// Variables de entorno (Vercel y .env.local):
//   R2_ENDPOINT           https://<account_id>.r2.cloudflarestorage.com
//   R2_ACCESS_KEY_ID      \  token de API de R2 con "Object Read & Write",
//   R2_SECRET_ACCESS_KEY  /  limitado al bucket
//   R2_BUCKET             stock-sc-catalogo
import { AwsClient } from "aws4fetch";

type Ctx = { aws: AwsClient; endpoint: string; bucket: string };
let ctx: Ctx | null = null;

function contexto(): Ctx {
  if (ctx) return ctx;
  const endpoint = process.env.R2_ENDPOINT?.replace(/\/+$/, "");
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 no está configurado en el servidor (faltan variables R2_*)");
  }
  ctx = {
    // aws4fetch reintenta 10 veces por defecto: con backoff excede el límite de la función.
    aws: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto", retries: 2 }),
    endpoint,
    bucket,
  };
  return ctx;
}

export function r2Configurado(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_BUCKET &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY
  );
}

// Las claves solo contienen [A-Za-z0-9._/-] (ver marketing-codigos.ts).
function urlObjeto(c: Ctx, clave: string): string {
  return `${c.endpoint}/${c.bucket}/${clave.split("/").map(encodeURIComponent).join("/")}`;
}

async function verificar(res: Response, accion: string, clave: string) {
  if (res.ok) return;
  const detalle = (await res.text().catch(() => "")).slice(0, 200);
  throw new Error(`R2 ${accion} ${clave} falló (${res.status}) ${detalle}`);
}

export async function r2Subir(
  clave: string,
  cuerpo: Buffer | Uint8Array,
  contentType: string,
  cacheControl: string
): Promise<void> {
  const c = contexto();
  const res = await c.aws.fetch(urlObjeto(c, clave), {
    method: "PUT",
    body: cuerpo as BodyInit,
    // R2 rechaza (411) las subidas sin Content-Length; el fetch de Next las manda en trozos.
    headers: {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
      "Content-Length": String(cuerpo.byteLength),
    },
    cache: "no-store",
  });
  await verificar(res, "PUT", clave);
}

/** Copia un objeto dentro del mismo bucket. Devuelve false si el origen no existe. */
export async function r2Copiar(origen: string, destino: string): Promise<boolean> {
  const c = contexto();
  const res = await c.aws.fetch(urlObjeto(c, destino), {
    method: "PUT",
    headers: { "x-amz-copy-source": `/${c.bucket}/${origen}` },
  });
  if (res.status === 404) return false;
  await verificar(res, "COPY", `${origen} → ${destino}`);
  return true;
}

/** Borra un objeto. S3 (y R2) responden 204 tanto si existía como si no, así que no hace falta comprobar antes. */
export async function r2Borrar(clave: string): Promise<void> {
  const c = contexto();
  const res = await c.aws.fetch(urlObjeto(c, clave), { method: "DELETE" });
  await verificar(res, "DELETE", clave);
}
