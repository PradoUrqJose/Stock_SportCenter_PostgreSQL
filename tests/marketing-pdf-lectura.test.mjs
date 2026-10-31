import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";

registerHooks({ resolve(specifier, context, next) {
  if (specifier === "./marketing-pdf-imagen") return next(`${specifier}.ts`, context);
  if (specifier === "@/lib/marketing-pdf-imagen")
    return next(new URL("../src/lib/marketing-pdf-imagen.ts", import.meta.url).href, context);
  return next(specifier, context);
} });
const { bytesDe, ErrorLectura, PdfCancelado } = await import("../src/lib/marketing-pdf-lectura.ts");
const { respaldoImagenPdf, claveImagenPdfValida } = await import("../src/lib/marketing-pdf-imagen.ts");
const { GET } = await import("../src/app/api/catalogo/imagen/route.ts");
const portada = "https://img.sportcenterpe.com/paginas-fijas/portada-accesorios-7b0cef3d.webp";

test("si el navegador bloquea la portada por CORS, recupera sus bytes desde el propio sitio", async (t) => {
  const llamadas = [];
  t.mock.method(globalThis, "fetch", async (url, opciones) => {
    llamadas.push({ url, opciones });
    if (llamadas.length === 1) throw new TypeError("Failed to fetch");
    return new Response(new Uint8Array([1, 2, 3]));
  });
  assert.deepEqual(await bytesDe(portada), new Uint8Array([1, 2, 3]));
  assert.equal(llamadas.length, 2);
  assert.equal(llamadas[1].url, "/api/catalogo/imagen?clave=paginas-fijas%2Fportada-accesorios-7b0cef3d.webp");
  assert.equal(llamadas[1].opciones.credentials, "omit");
});

test("la lectura normal sigue directa al CDN y un 404 conserva su significado", async (t) => {
  let n = 0;
  const fetch = t.mock.method(globalThis, "fetch", async () => { n++; return new Response("ok"); });
  await bytesDe(portada);
  assert.equal(n, 1);
  fetch.mock.mockImplementation(async () => { n++; return new Response(null, { status: 404 }); });
  await assert.rejects(bytesDe(portada), (e) => e instanceof ErrorLectura && e.estado === 404);
  assert.equal(n, 2);
});

test("cancelar una lectura interrumpe la descarga y no inicia el respaldo", async (t) => {
  const control = new AbortController();
  let n = 0;
  t.mock.method(globalThis, "fetch", async (_, { signal }) => {
    n++;
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  });
  const lectura = bytesDe(portada, control.signal);
  control.abort();
  await assert.rejects(lectura, PdfCancelado);
  assert.equal(n, 1);
});

test("una lectura directa colgada vence y se recupera por el sitio", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let n = 0;
  t.mock.method(globalThis, "fetch", async (_, { signal }) => {
    if (++n > 1) return new Response(new Uint8Array([4, 5]));
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  });
  const lectura = bytesDe(portada);
  t.mock.timers.tick(20_000);
  assert.deepEqual(await lectura, new Uint8Array([4, 5]));
  assert.equal(n, 2);
});

test("el respaldo sirve portadas, fondos y productos, conserva la revisión y rechaza otras rutas", () => {
  for (const clave of ["paginas-fijas/portada-accesorios-7b0cef3d.webp", "plantillas/adidas/adidas-7b0cef3d.jpg", "derivados/w1200/FPF 02092.webp"])
    assert.equal(claveImagenPdfValida(clave), true, clave);
  assert.equal(new URL(respaldoImagenPdf("https://img.example/derivados/w1200/FPF%2002092.webp?v=7"), "https://sitio.example").searchParams.get("v"), "7");
  for (const clave of ["../.env", "paginas-fijas/../privado.webp", "https://evil.test/a.webp", "derivados/w1200/%2e%2e.webp", "otros/archivo.png", "plantillas/a/b.jpg/extra", "paginas-fijas/portada-123.webp?host=evil"])
    assert.equal(claveImagenPdfValida(clave), false, clave);
  assert.equal(respaldoImagenPdf("https://evil.test/privado.png"), null);
});

test("la API rechaza claves ajenas antes de consultar y nunca recibe un origen del cliente", async (t) => {
  const llamadas = [];
  t.mock.method(globalThis, "fetch", async (url, opciones) => { llamadas.push({url, opciones}); return new Response(new Uint8Array([1, 2, 3])); });
  assert.equal((await GET(new Request("http://local/api/catalogo/imagen?clave=..%2F.env"))).status, 400);
  assert.equal(llamadas.length, 0);
  const r = await GET(new Request("http://local/api/catalogo/imagen?clave=derivados%2Fw1200%2FFPF%2002092.webp&v=7&url=https://evil.test"));
  assert.equal(r.status, 200);
  assert.equal(llamadas[0].url.origin, new URL(process.env.R2_PUBLIC_URL ?? "https://img.sportcenterpe.com").origin);
  assert.equal(llamadas[0].url.pathname, "/derivados/w1200/FPF%2002092.webp");
  assert.equal(llamadas[0].url.search, "?v=7");
  assert.equal(llamadas[0].opciones.redirect, "error");
  assert.equal(r.headers.get("content-type"), "image/webp");
});

test("la API conserva un 404, no cachea errores y limita el tamaño de imágenes", async (t) => {
  const f = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 404 }));
  const req = new Request(`http://local/api/catalogo/imagen?clave=${encodeURIComponent("paginas-fijas/portada-accesorios-7b0cef3d.webp")}`);
  let r = await GET(req);
  assert.equal(r.status, 404);
  assert.equal(r.headers.get("cache-control"), "no-store");
  f.mock.mockImplementation(async () => new Response(null, { headers: { "Content-Length": String(5 * 1024 * 1024) } }));
  r = await GET(req);
  assert.equal(r.status, 413);
  f.mock.mockImplementation(async () => { throw new Error("Sin conexión"); });
  r = await GET(req);
  assert.equal(r.status, 502);
});
