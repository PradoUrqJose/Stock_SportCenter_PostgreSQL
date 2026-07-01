import * as XLSX from "xlsx";
import type { BuildResult, ImagenInsert, ProductoInsert, VarianteInsert, VentaInsert } from "./types";

const ALMACENES_VALIDOS = new Set([
  "JAL1", "JAL4", "T01", "T02", "T03", "T04", "T05",
  "T06", "T07", "T08", "T09", "T10", "OUT",
]);

// --- helpers ---

function str(val: unknown): string | null {
  if (val == null || val === "") return null;
  return String(val).trim().toUpperCase();
}

function num(val: unknown): number | null {
  if (val == null || val === "") return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

// El código de barras codifica la fecha del lote de ingreso. Dos formatos coexisten
// (prefijo = cualquier letra: J, D, P, V, I, B…):
//   • 12 chars → Letra + AAMMDD + serial(5)  → día real (ej. J24092800086 → 2024-09-28)
//   • 9-10 chars (antiguos) → Letra + AAMM + serial → solo año/mes, DÍA = MES
//     (ej. J181100537 → 2018-11-11, D11081326 → 2011-08-08)
export function parseIngresofecha(barcode: string): string | null {
  const m = barcode.match(/^[A-Za-z](\d+)/);
  if (!m) return null;
  const digits = m[1];
  if (digits.length < 4) return null;

  const aa = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const month = parseInt(mm, 10);
  if (month < 1 || month > 12) return null;

  let dd = mm; // formato antiguo: día = mes
  if (barcode.length === 12) {
    const dayStr = digits.slice(4, 6);
    const day = parseInt(dayStr, 10);
    if (day >= 1 && day <= 31) dd = dayStr; // día real; si viene inválido, cae a día = mes
  }

  return `${2000 + parseInt(aa, 10)}-${mm}-${dd}`;
}

function readAsBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as ArrayBuffer);
    r.onerror = () => rej(r.error);
    r.readAsArrayBuffer(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsText(file, "utf-8");
  });
}

// normalizes header for flexible matching: removes spaces, periods, accents, toUpperCase
function normHeader(s: string) {
  return s
    .replace(/[\ufeff]/g, "")
    .replace(/[\s.]+/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function findCol(headers: string[], search: string): number {
  const target = normHeader(search);
  return headers.findIndex((h) => normHeader(h) === target);
}

type HtmlTable = {
  headers: string[];
  cells: (string | null)[][];
  imgSrcs: (string | null)[][];
};

function parseHtmlTable(html: string): HtmlTable {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const trs = Array.from(doc.querySelectorAll("table tr"));
  if (trs.length === 0) return { headers: [], cells: [], imgSrcs: [] };

  const headers = Array.from(trs[0].querySelectorAll("th, td")).map(
    (el) => el.textContent?.trim() ?? ""
  );

  const cells: (string | null)[][] = [];
  const imgSrcs: (string | null)[][] = [];

  for (const tr of trs.slice(1)) {
    const tds = Array.from(tr.querySelectorAll("td"));
    cells.push(tds.map((td) => td.textContent?.trim() || null));
    imgSrcs.push(tds.map((td) => td.querySelector("img")?.getAttribute("src") ?? null));
  }

  return { headers, cells, imgSrcs };
}

// --- public parsers ---

export async function parseStockFile(file: File): Promise<Record<string, unknown>[]> {
  const buf = await readAsBuffer(file);
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];

  // Find the header row dynamically — ERP may prepend title rows before the real headers
  const rawArrays = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
  const headerRowIdx = rawArrays.findIndex((row) =>
    Array.isArray(row) &&
    row.some((cell) => {
      const s = String(cell ?? "").trim().toUpperCase();
      return s === "IZQ" || s === "COD.BARRAS" || s === "COD.PROD";
    })
  );
  if (headerRowIdx === -1) throw new Error("No se encontró la fila de encabezados en el Excel (se buscó IZQ / COD.BARRAS / COD.PROD).");

  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, range: headerRowIdx });
}

export async function parseImagesFile(file: File): Promise<Map<string, string>> {
  const html = await readAsText(file);
  const { headers, cells, imgSrcs } = parseHtmlTable(html);

  const codIdx = findCol(headers, "COD. UNIVERSAL");
  const fotoIdx = findCol(headers, "FOTO");

  const map = new Map<string, string>();
  for (let i = 0; i < cells.length; i++) {
    const cod = cells[i][codIdx];
    const url = imgSrcs[i]?.[fotoIdx] ?? cells[i][fotoIdx];
    if (!cod || !url) continue;
    if (!url.startsWith("http://") && !url.startsWith("https://")) continue;
    map.set(cod.trim().toUpperCase(), url);
  }
  return map;
}

// Each file name contains the discount %, e.g. "desc_10.html" → 10%
export async function parseDiscountFiles(files: File[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();

  for (const file of files) {
    const pctMatch = file.name.match(/\d+/);
    if (!pctMatch) continue;
    const pct = parseInt(pctMatch[0], 10);

    const html = await readAsText(file);
    const { headers, cells } = parseHtmlTable(html);

    const codIdx = findCol(headers, "COD. UNIVERSAL.");
    if (codIdx === -1) continue;

    for (const row of cells) {
      const cod = row[codIdx];
      if (!cod) continue;
      map.set(cod.trim().toUpperCase(), pct);
    }
  }

  return map;
}

export function buildData(
  rawRows: Record<string, unknown>[],
  imageMap: Map<string, string>,
  discountMap: Map<string, number>
): BuildResult {
  // keep only rows where alm_izq OR alm_der is a valid warehouse
  const validRows = rawRows.filter((r) => {
    const izq = str(r["IZQ"]);
    const der = str(r["DER"]);
    return (izq && ALMACENES_VALIDOS.has(izq)) || (der && ALMACENES_VALIDOS.has(der));
  });

  // variantes — deduplicated by cod_barras
  const seenBarcodes = new Set<string>();
  const variantes: VarianteInsert[] = [];

  for (const r of validRows) {
    const cod_barras = str(r["COD.BARRAS"]);
    if (!cod_barras || seenBarcodes.has(cod_barras)) continue;
    seenBarcodes.add(cod_barras);

    variantes.push({
      cod_barras,
      cod_universal: str(r["COD.UNIV."]) ?? "",
      genero: str(r["GENERO"]) ?? "",
      talla: str(r["TALLA"]),
      alm_izq: str(r["IZQ"]),
      alm_der: str(r["DER"]),
      cod_prod: str(r["COD.PROD"]),
      precio_compra: num(r["COMPRA"]),
      ingreso_fecha: parseIngresofecha(cod_barras),
    });
  }

  // productos — grouped by (cod_universal, genero), stock_total = count of variantes
  const productoMap = new Map<string, ProductoInsert>();

  for (const r of validRows) {
    const cod_universal = str(r["COD.UNIV."]) ?? "";
    const genero = str(r["GENERO"]) ?? "";
    if (!cod_universal || !genero) continue;

    const key = `${cod_universal}|${genero}`;

    if (!productoMap.has(key)) {
      const descuento = discountMap.get(cod_universal) ?? 0;
      productoMap.set(key, {
        cod_universal,
        genero,
        marca: str(r["MARCA"]),
        modelo: str(r["MODELO"]),
        categoria: str(r["CATEGORIA"]),
        grupo: str(r["GRUPO"]),
        color: str(r["COLOR"]),
        precio_lista: num(r["LISTA"]) ?? 0,
        descuento,
        stock_total: 0,
      });
    }

    productoMap.get(key)!.stock_total++;
  }

  const productos = Array.from(productoMap.values());

  // imagenes
  const imagenes: ImagenInsert[] = Array.from(imageMap, ([cod_universal, imagen_url]) => ({
    cod_universal,
    imagen_url,
  }));

  return { productos, variantes, imagenes };
}

function parseDate(val: unknown): string | null {
  if (val == null || val === "") return null;
  // Date object from cellDates:true
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val.toISOString().slice(0, 10);
  }
  // Excel serial number
  if (typeof val === "number") {
    try {
      const d = XLSX.SSF.parse_date_code(val);
      const m = String(d.m).padStart(2, "0");
      const dy = String(d.d).padStart(2, "0");
      return `${d.y}-${m}-${dy}`;
    } catch {
      return null;
    }
  }
  const s = String(val).trim();
  // DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

export async function parseVentasFile(file: File): Promise<VentaInsert[]> {
  const buf = await readAsBuffer(file);
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];

  // Read ALL rows as arrays (header:1) — avoids XLSX auto-generated __EMPTY keys
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });

  const headerRowIdx = allRows.findIndex((row) =>
    Array.isArray(row) &&
    row.some((cell) => {
      const s = normHeader(String(cell ?? ""));
      return s === "CODBARRAS" || s === "CODUNIV" || s === "FECVENDIDA";
    })
  );
  if (headerRowIdx === -1) throw new Error("No se encontró la fila de encabezados en el archivo de ventas.");

  const headerRow: string[] = (allRows[headerRowIdx] ?? []).map((c) => String(c ?? ""));
  const dataRows = allRows.slice(headerRowIdx + 1);
  function colIdx(patterns: string[]): number {
    for (const p of patterns) {
      const idx = headerRow.findIndex((h) => normHeader(h) === normHeader(p));
      if (idx !== -1) return idx;
    }
    return headerRow.findIndex((h) => patterns.some((p) => normHeader(h).includes(normHeader(p))));
  }

  const idxBarras   = colIdx(["COD.BARRAS", "BARRAS", "CODBARRAS", "CODBARRA"]);
  const idxFecha    = colIdx(["FEC.VENDIDA", "FECHA", "FEC"]);
  const idxUniv     = colIdx(["COD.UNIV.", "CODUNIV", "CODUNIVERSAL"]);
  const idxGenero   = colIdx(["GENERO"]);
  const idxVend     = colIdx(["VEND"]);        // flag S/N — solo cuenta lo vendido
  const idxIzq      = colIdx(["IZQ"]);
  const idxDer      = colIdx(["DER"]);
  const idxMarca    = colIdx(["MARCA"]);
  const idxModelo   = colIdx(["MODELO"]);
  const idxCateg    = colIdx(["CATEGORIA"]);
  const idxGrupo    = colIdx(["GRUPO"]);
  const idxColor    = colIdx(["COLOR"]);
  const idxTalla    = colIdx(["TALLA"]);
  const idxCompra   = colIdx(["COMPRA"]);
  const idxLista    = colIdx(["LISTA"]);
  const idxImporte  = colIdx(["VENTA", "IMPORTE", "TOTAL", "MONTO", "VALOR"]);

  if (idxBarras === -1) throw new Error("No se encontró columna de código de barras.");
  if (idxFecha  === -1) throw new Error("No se encontró columna de fecha.");

  const at = (row: unknown[], idx: number): unknown => (idx !== -1 ? row[idx] : null);

  const result: VentaInsert[] = [];
  for (const row of dataRows) {
    if (!Array.isArray(row)) continue;

    // Solo unidades efectivamente vendidas (VEND='S'). Si no hay columna VEND,
    // la fecha de venta válida hace de filtro.
    if (idxVend !== -1 && str(row[idxVend]) !== "S") continue;

    const cod_barras = str(row[idxBarras]);
    if (!cod_barras) continue;

    const fecha_venta = parseDate(row[idxFecha]);
    if (!fecha_venta) continue;

    result.push({
      cod_barras,
      cod_universal: str(at(row, idxUniv)),
      genero: str(at(row, idxGenero)),
      fecha_venta,
      ingreso_fecha: parseIngresofecha(cod_barras),
      almacen: str(at(row, idxIzq)) ?? str(at(row, idxDer)),
      marca: str(at(row, idxMarca)),
      modelo: str(at(row, idxModelo)),
      categoria: str(at(row, idxCateg)),
      grupo: str(at(row, idxGrupo)),
      color: str(at(row, idxColor)),
      talla: str(at(row, idxTalla)),
      precio_compra: num(at(row, idxCompra)),
      precio_lista: num(at(row, idxLista)),
      importe: num(at(row, idxImporte)),
    });
  }

  return result;
}
