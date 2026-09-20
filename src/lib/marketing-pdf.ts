// PDF de un catálogo, armado EN EL NAVEGADOR de quien lo pide (nada se guarda ni pasa por el
// servidor). Sirve igual para el visor público y para el editor: recibe páginas, productos y
// plantillas (la misma forma que el snapshot) y dibuja cada página como en pantalla.
//
// Para que pese poco (medido en la prueba: ~40 KB por página):
//  - el fondo de cada plantilla (JPEG) se guarda UNA vez y se reutiliza en todas sus páginas;
//  - de cada zapatilla solo se guarda su recorte, ya compuesto sobre el fondo, en JPEG (no un
//    PNG con transparencia) y sin los márgenes vacíos de la imagen;
//  - los textos son texto real (buscable, con Montserrat Black incrustada), no imágenes;
//  - las páginas de imagen (portadas, términos…) se guardan una vez aunque se repitan
//    (existen solo en WebP: se pasan a JPEG en el navegador).
// Las imágenes las lee el navegador desde R2 con CORS (regla del bucket para GET/HEAD).
import type { jsPDF } from "jspdf";
import type {
  PaginaCat,
  PaginaFija,
  PlantillaSnap,
  ProductoCat,
} from "./marketing-catalogo";
import { ajustar, ALTO_LINEA } from "./marketing-texto";

/** Ancho de página en el PDF (pt). El alto sale de la proporción de cada diseño. */
const ANCHO_PT = 1500;
/** Píxeles del recorte de la zapatilla por px de diseño (0,9 ≈ 1800 px en un diseño de 2000). */
const RESOLUCION = 0.9;
const CALIDAD_JPEG = 0.8;
/**
 * Zapatillas que se piden por adelantado mientras se arma la página actual. Cada imagen tarda ~200 ms en llegar
 * (medido: 899 imágenes con 6 a la vez = 58 s en producción); como van por HTTP/2, pedir más a la vez lo baja casi
 * en proporción. Cada una pesa ~50 KB, así que 24 por adelantado son ~1 MB en memoria.
 */
const PARALELAS = 24;
/** Baseline de Montserrat dentro de una línea de alto 1,12 (ascent 0,968 y descent 0,251 → media interlínea). */
const BASE_LINEA = 0.968 + (ALTO_LINEA - 1.219) / 2;

export type EntradaPdf = {
  titulo: string;
  /** Dirección pública del bucket (sin barra final). */
  base: string;
  paginas: PaginaCat[];
  productos: ProductoCat[];
  plantillas: Record<string, PlantillaSnap>;
};

// ---------- qué páginas entran ----------
export type GrupoMarca = { marca: string; indices: number[] };

/** Las páginas de producto agrupadas por marca (en el orden del catálogo). */
export function marcasDelCatalogo(
  e: Pick<EntradaPdf, "paginas" | "productos">,
): GrupoMarca[] {
  const grupos = new Map<string, number[]>();
  e.paginas.forEach((p, i) => {
    if (p.tipo !== "producto") return;
    const marca = e.productos[p.prod]?.marca ?? "";
    if (!marca) return;
    const lista = grupos.get(marca);
    if (lista) lista.push(i);
    else grupos.set(marca, [i]);
  });
  return [...grupos].map(([marca, indices]) => ({ marca, indices }));
}

/** Estimación gruesa del tamaño del PDF (MB): ~45 KB por producto y ~0,2 MB por página de imagen distinta. */
export function estimarMb(
  e: Pick<EntradaPdf, "paginas">,
  indices: number[],
): number {
  let productos = 0;
  const imagenes = new Set<string>();
  for (const i of indices) {
    const p = e.paginas[i];
    if (!p) continue;
    if (p.tipo === "producto") productos++;
    else imagenes.add(p.imagen);
  }
  return (productos * 45 + imagenes.size * 200) / 1024;
}

// ---------- utilidades ----------
export class PdfCancelado extends Error {
  constructor() {
    super("PDF cancelado");
  }
}

function revisar(senal?: AbortSignal) {
  if (senal?.aborted) throw new PdfCancelado();
}

/** Una lectura que no tiene sentido repetir (por ejemplo, la imagen no existe: HTTP 404). */
class ErrorLectura extends Error {
  constructor(
    mensaje: string,
    readonly estado: number,
  ) {
    super(mensaje);
  }
}

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const corto = (url: string) => url.replace(/^https?:\/\/[^/]+\//, "");

// Las imágenes se piden con `cache: "reload"`: la pantalla ya pudo haberlas cargado con un <img>, que no envía
// `Origin` y guarda la respuesta SIN la cabecera CORS; Chrome reutilizaría esa copia y bloquearía la lectura
// (probado: la portada mostrada en el visor fallaba con el fetch normal).
// Ante un corte de red o un error del servidor se reintenta (3 intentos); un 404 no se repite.
async function bytesDe(
  url: string,
  senal?: AbortSignal,
  recargar = true,
): Promise<Uint8Array> {
  let ultimo = "";
  for (let intento = 0; intento < 3; intento++) {
    revisar(senal);
    try {
      const r = await fetch(url, {
        signal: senal,
        cache: recargar ? "reload" : "default",
      });
      if (r.ok) return new Uint8Array(await r.arrayBuffer());
      ultimo = `HTTP ${r.status}`;
      if (r.status !== 429 && r.status < 500)
        throw new ErrorLectura(
          `No se pudo leer ${corto(url)} (${ultimo})`,
          r.status,
        );
    } catch (e) {
      if (senal?.aborted) throw new PdfCancelado();
      if (e instanceof ErrorLectura) throw e;
      ultimo =
        mensajeDe(e) === "Failed to fetch"
          ? "sin conexión o sin permiso CORS del navegador"
          : mensajeDe(e);
    }
    await esperar(400 * (intento + 1));
  }
  throw new ErrorLectura(`No se pudo leer ${corto(url)} (${ultimo})`, 0);
}

function aBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let j = 0; j < bytes.length; j += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(j, j + 0x8000));
  return btoa(bin);
}

/** Rectángulo (en fracciones 0–1 de la imagen) que contiene los píxeles no transparentes. */
function cajaOpaca(img: ImageBitmap): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} {
  const N = 300;
  const c = document.createElement("canvas");
  c.width = N;
  c.height = N;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, N, N);
  const d = g.getImageData(0, 0, N, N).data;
  let x0 = N,
    y0 = N,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      if (d[(y * N + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return { x0: 0, y0: 0, x1: 1, y1: 1 };
  return {
    x0: Math.max(0, x0 - 1) / N,
    y0: Math.max(0, y0 - 1) / N,
    x1: Math.min(N, x1 + 2) / N,
    y1: Math.min(N, y1 + 2) / N,
  };
}

/** Convierte una imagen WebP en JPEG (fondo blanco por si trae transparencia), como mucho de `anchoMax` px de ancho. */
async function webpAJpeg(
  bytes: Uint8Array,
  anchoMax: number,
): Promise<Uint8Array> {
  const bmp = await createImageBitmap(
    new Blob([bytes as BlobPart], { type: "image/webp" }),
  );
  try {
    const k = Math.min(1, anchoMax / bmp.width);
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    const jpg = await new Promise<Blob | null>((ok) =>
      c.toBlob(ok, "image/jpeg", 0.85),
    );
    if (!jpg) throw new Error("No se pudo convertir la página de imagen");
    return new Uint8Array(await jpg.arrayBuffer());
  } finally {
    bmp.close();
  }
}

const blobJpeg = (bytes: Uint8Array) =>
  new Blob([bytes as BlobPart], { type: "image/jpeg" });

// ---------- generación ----------
export async function generarPdf(
  e: EntradaPdf,
  seleccion: number[],
  opciones: {
    alProgreso?: (hechas: number, total: number) => void;
    senal?: AbortSignal;
  } = {},
): Promise<{ pdf: Blob; sinImagen: string[] }> {
  const { alProgreso, senal } = opciones;
  const indices = seleccion.filter((i) => e.paginas[i]);
  if (indices.length === 0) throw new Error("No hay páginas para el PDF");

  // jsPDF y la fuente solo se descargan al pedir el PDF.
  const [{ jsPDF }, fuenteBytes] = await Promise.all([
    import("jspdf"),
    bytesDe(
      new URL("./fuentes/Montserrat-Black.ttf", import.meta.url).href,
      senal,
      false,
    ),
  ]);
  revisar(senal);

  let doc: jsPDF | null = null;
  const nuevaPagina = (ancho: number, alto: number): jsPDF => {
    const orientacion = ancho >= alto ? "l" : "p";
    if (!doc) {
      doc = new jsPDF({
        orientation: orientacion,
        unit: "pt",
        format: [ancho, alto],
        compress: true,
      });
      doc.addFileToVFS("Montserrat-Black.ttf", aBase64(fuenteBytes));
      doc.addFont(
        "Montserrat-Black.ttf",
        "Montserrat",
        "normal",
        undefined,
        "Identity-H",
      );
      doc.setProperties({ title: e.titulo, creator: "Sport Center" });
    } else {
      doc.addPage([ancho, alto], orientacion);
    }
    return doc;
  };

  // Fondos (JPEG) de las plantillas que se usan, leídos una vez.
  const fondos = new Map<string, { bytes: Uint8Array; bmp: ImageBitmap }>();
  const usadas = new Set<string>();
  for (const i of indices) {
    const p = e.paginas[i];
    if (p.tipo === "producto") usadas.add(p.plantilla);
  }
  await Promise.all(
    [...usadas].map(async (plId) => {
      const pl = e.plantillas[plId];
      if (!pl) return;
      const bytes = await bytesDe(`${e.base}/${pl.fondo}.jpg`, senal);
      fondos.set(plId, {
        bytes,
        bmp: await createImageBitmap(blobJpeg(bytes)),
      });
    }),
  );
  revisar(senal);

  // Descarga de zapatillas adelantada (hasta PARALELAS a la vez) mientras se arma la página actual.
  const claveZapatilla = (p: ProductoCat) => `${p.cod}.v${p.v}`;
  const enCurso = new Map<string, Promise<Uint8Array | null>>();
  const pedirZapatilla = (i: number) => {
    const p = e.paginas[i];
    if (!p || p.tipo !== "producto") return;
    const prod = e.productos[p.prod];
    if (!prod) return;
    const clave = claveZapatilla(prod);
    if (enCurso.has(clave)) return;
    const promesa = bytesDe(
      `${e.base}/derivados/w1200/${encodeURIComponent(prod.cod)}.v${prod.v}.webp`,
      senal,
    ).catch((err) => {
      // Si la imagen de un producto no existe (404) no se cae todo el PDF: la página sale sin zapatilla y se avisa al final.
      if (err instanceof ErrorLectura && err.estado === 404) return null;
      throw err;
    });
    promesa.catch(() => undefined); // el error se muestra al usarla; evita el aviso de promesa sin atender
    enCurso.set(clave, promesa);
  };
  // Cronómetro por fases (ms): se muestra una vez al terminar en la consola, para saber dónde se va el tiempo.
  const t = { espera: 0, decodificar: 0, componer: 0, jspdf: 0, texto: 0 };
  const ahora = () => performance.now();
  const sinImagen: string[] = [];
  const cajas = new Map<
    string,
    { x0: number; y0: number; x1: number; y1: number }
  >();
  const paginasDeImagen = new Map<string, Uint8Array>();

  const lienzo = document.createElement("canvas");
  const g = lienzo.getContext("2d")!;
  const total = indices.length;

  for (let n = 0; n < total; n++) {
    revisar(senal);
    for (let k = n; k < Math.min(total, n + PARALELAS); k++)
      pedirZapatilla(indices[k]);

    const pag = e.paginas[indices[n]];
    try {
      if (pag.tipo === "fija") {
        await paginaFija(pag, e.base, nuevaPagina, paginasDeImagen, senal);
      } else {
        const prod = e.productos[pag.prod];
        const pl = e.plantillas[pag.plantilla];
        const fondo = fondos.get(pag.plantilla);
        if (prod && pl && fondo) {
          const S = ANCHO_PT / pl.ancho;
          const d = nuevaPagina(ANCHO_PT, pl.alto * S);
          d.addImage(
            fondo.bytes,
            "JPEG",
            0,
            0,
            ANCHO_PT,
            pl.alto * S,
            `fondo:${pag.plantilla}`,
            "NONE",
          );

          const clave = claveZapatilla(prod);
          let t0 = ahora();
          const zapatilla = await enCurso.get(clave)!;
          enCurso.delete(clave);
          t.espera += ahora() - t0;
          if (!zapatilla) sinImagen.push(prod.cod);
          t0 = ahora();
          const bmp = zapatilla
            ? await createImageBitmap(
                new Blob([zapatilla as BlobPart], { type: "image/webp" }),
              )
            : null;
          try {
            if (bmp && !cajas.has(clave)) cajas.set(clave, cajaOpaca(bmp));
            const caja = cajas.get(clave) ?? { x0: 0, y0: 0, x1: 1, y1: 1 };
            t.decodificar += ahora() - t0;
            t0 = ahora();
            // Misma geometría que el visor: la imagen ocupa la zona de la zapatilla y se corre/escala desde su centro.
            const z = pl.zonas.zapatilla;
            const a = pag.ajuste ?? { dx: 0, dy: 0, s: 1 };
            const w = z.w * a.s,
              h = z.h * a.s;
            const x0 = z.x + z.w / 2 + a.dx - w / 2,
              y0 = z.y + z.h / 2 + a.dy - h / 2;
            const cx0 = Math.max(0, Math.floor(x0 + caja.x0 * w)),
              cy0 = Math.max(0, Math.floor(y0 + caja.y0 * h));
            const cx1 = Math.min(pl.ancho, Math.ceil(x0 + caja.x1 * w)),
              cy1 = Math.min(pl.alto, Math.ceil(y0 + caja.y1 * h));
            if (bmp && cx1 > cx0 && cy1 > cy0) {
              lienzo.width = Math.round((cx1 - cx0) * RESOLUCION);
              lienzo.height = Math.round((cy1 - cy0) * RESOLUCION);
              g.drawImage(
                fondo.bmp,
                (cx0 / pl.ancho) * fondo.bmp.width,
                (cy0 / pl.alto) * fondo.bmp.height,
                ((cx1 - cx0) / pl.ancho) * fondo.bmp.width,
                ((cy1 - cy0) / pl.alto) * fondo.bmp.height,
                0,
                0,
                lienzo.width,
                lienzo.height,
              );
              g.drawImage(
                bmp,
                0,
                0,
                bmp.width,
                bmp.height,
                (x0 - cx0) * RESOLUCION,
                (y0 - cy0) * RESOLUCION,
                w * RESOLUCION,
                h * RESOLUCION,
              );
              const jpg = await new Promise<Blob | null>((ok) =>
                lienzo.toBlob(ok, "image/jpeg", CALIDAD_JPEG),
              );
              if (!jpg) throw new Error("No se pudo componer la zapatilla");
              const bytesJpg = new Uint8Array(await jpg.arrayBuffer());
              t.componer += ahora() - t0;
              t0 = ahora();
              d.addImage(
                bytesJpg,
                "JPEG",
                cx0 * S,
                cy0 * S,
                (cx1 - cx0) * S,
                (cy1 - cy0) * S,
                undefined,
                "NONE",
              );
            }
          } finally {
            bmp?.close();
          }
          t.jspdf += ahora() - t0;
          t0 = ahora();
          textosProducto(d, prod, pl, S);
          t.texto += ahora() - t0;
        }
      }
    } catch (err) {
      if (err instanceof PdfCancelado) throw err;
      const cod =
        pag.tipo === "producto"
          ? ` (${e.productos[pag.prod]?.cod ?? "?"})`
          : "";
      throw new Error(`Página ${indices[n] + 1}${cod}: ${mensajeDe(err)}`, {
        cause: err,
      });
    }
    alProgreso?.(n + 1, total);
    if (n % 5 === 4) await new Promise((r) => setTimeout(r)); // deja respirar a la pantalla
  }

  fondos.forEach((f) => f.bmp.close());
  const tSalida = ahora();
  const pdf = doc!.output("blob");
  console.info("[PDF] tiempos (ms)", {
    paginas: total,
    ...Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v)])),
    salida: Math.round(ahora() - tSalida),
  });
  return { pdf, sinImagen };
}

async function paginaFija(
  pag: PaginaFija,
  base: string,
  nuevaPagina: (ancho: number, alto: number) => jsPDF,
  cache: Map<string, Uint8Array>,
  senal?: AbortSignal,
) {
  const S = ANCHO_PT / pag.ancho;
  const alto = pag.alto * S;
  const d = nuevaPagina(ANCHO_PT, alto);
  let bytes = cache.get(pag.imagen);
  if (!bytes) {
    // Las páginas de imagen solo existen en WebP (las plantillas sí traen su JPEG): se pasan a JPEG aquí.
    // Una vez por imagen distinta, aunque la página se repita.
    bytes = await webpAJpeg(
      await bytesDe(`${base}/${pag.imagen}.webp`, senal),
      pag.ancho,
    );
    cache.set(pag.imagen, bytes);
  }
  d.addImage(bytes, "JPEG", 0, 0, ANCHO_PT, alto, `fija:${pag.imagen}`, "NONE");
  // Los enlaces de la portada (WhatsApp, redes…) también funcionan dentro del PDF.
  for (const z of pag.zonas ?? []) {
    d.link(z.x * ANCHO_PT, z.y * alto, z.w * ANCHO_PT, z.h * alto, {
      url: z.url,
    });
  }
}

function textosProducto(
  d: jsPDF,
  prod: ProductoCat,
  pl: PlantillaSnap,
  S: number,
) {
  d.setFont("Montserrat", "normal");
  // Se mide con la misma fuente que se dibuja: el tamaño resultante coincide con el de la pantalla.
  const medir = (texto: string, px: number) =>
    d.setFontSize(px * S).getTextWidth(texto) / S;
  const filas: [keyof PlantillaSnap["zonas"], string[], string, boolean][] = [
    ["codigo", [prod.cod], "", false],
    ["tallas", prod.tallas.length ? prod.tallas : ["—"], " · ", true],
    ["precio", [`S/ ${Number(prod.precio).toFixed(2)}`], "", true],
  ];
  for (const [clave, partes, sep, centrado] of filas) {
    const zona = pl.zonas[clave];
    const { px, lineas } = ajustar(partes, zona, sep, medir);
    d.setFontSize(px * S).setTextColor(zona.color ?? "#e8e8e8");
    const alto = px * ALTO_LINEA;
    const arriba = zona.y + (zona.h - lineas.length * alto) / 2;
    lineas.forEach((linea, j) => {
      const y = (arriba + alto * j + px * BASE_LINEA) * S;
      if (centrado)
        d.text(linea, (zona.x + zona.w / 2) * S, y, { align: "center" });
      else d.text(linea, zona.x * S, y);
    });
  }
}

// ---------- descarga ----------
export function nombreArchivoPdf(titulo: string, detalle?: string): string {
  const limpio = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${limpio || "catalogo"}${detalle ? `-${detalle}` : ""}.pdf`;
}

export function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
