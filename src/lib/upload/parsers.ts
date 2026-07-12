import * as XLSX from "xlsx";
import type {
  BuildResult, ImagenInsert, ProductoInsert, VarianteInsert, VentaInsert,
  FacturacionInsert, IngresoInsert,
} from "./types";

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

// Minimal RFC4180-ish CSV parser: handles quoted fields (with embedded commas/
// newlines/escaped quotes) and both \n and \r\n line endings.
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += c;
        i++;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
    } else if (c === ",") {
      row.push(field);
      field = "";
      i++;
    } else if (c === "\r") {
      i++;
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else {
      field += c;
      i++;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
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

// --- public parsers ---

export async function parseStockFile(file: File): Promise<Record<string, unknown>[]> {
  const text = await readAsText(file);
  const rows = parseCSV(text);

  // Find the header row dynamically — ERP export may prepend title rows before the real headers
  const headerRowIdx = rows.findIndex((row) =>
    row.some((cell) => {
      const s = String(cell ?? "").trim().toUpperCase();
      return s === "IZQ" || s === "COD.BARRAS" || s === "COD.PROD";
    })
  );
  if (headerRowIdx === -1) throw new Error("No se encontró la fila de encabezados en el CSV (se buscó IZQ / COD.BARRAS / COD.PROD).");

  const headers = rows[headerRowIdx].map((h) => h.trim());
  return rows.slice(headerRowIdx + 1).map((row) => {
    const rec: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      const v = row[i];
      rec[h] = v == null || v === "" ? null : v;
    });
    return rec;
  });
}

// El ERP sirve íconos placeholder (ej. "Used Product-100.png") desde su propia
// carpeta de recursos del sistema cuando el producto no tiene foto real. No son
// fotos de producto, así que cualquier URL bajo esa ruta se descarta.
const PLACEHOLDER_IMAGE_PATH = "/recursos/img/iconsistem/";

function isPlaceholderImage(url: string): boolean {
  return url.toLowerCase().includes(PLACEHOLDER_IMAGE_PATH);
}

export async function parseImagesFile(file: File): Promise<Map<string, string>> {
  const text = await readAsText(file);
  const rows = parseCSV(text);
  if (rows.length === 0) return new Map();

  const headers = rows[0].map((h) => h.trim());
  const codIdx = findCol(headers, "COD.UNIVERSAL");
  const fotoIdx = findCol(headers, "FOTO");

  const map = new Map<string, string>();
  for (const row of rows.slice(1)) {
    const cod = row[codIdx]?.trim();
    const url = row[fotoIdx]?.trim();
    if (!cod || !url) continue;
    if (!url.startsWith("http://") && !url.startsWith("https://")) continue;
    if (isPlaceholderImage(url)) continue;
    map.set(cod.toUpperCase(), url);
  }
  return map;
}

// descuentos.csv: columnas COD.UNIVERSAL y DESCUENTO, con el % como texto (ej: "70%")
export async function parseDiscountFile(file: File): Promise<Map<string, number>> {
  const text = await readAsText(file);
  const rows = parseCSV(text);
  if (rows.length === 0) return new Map();

  const headers = rows[0].map((h) => h.trim());
  const codIdx = findCol(headers, "COD.UNIVERSAL");
  const descIdx = findCol(headers, "DESCUENTO");
  if (codIdx === -1 || descIdx === -1) return new Map();

  const map = new Map<string, number>();
  for (const row of rows.slice(1)) {
    const cod = row[codIdx]?.trim();
    const rawDesc = row[descIdx]?.trim();
    if (!cod || !rawDesc) continue;
    const pct = parseInt(rawDesc.replace("%", ""), 10);
    if (isNaN(pct)) continue;
    map.set(cod.toUpperCase(), pct);
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

// Lee un .xlsx a filas-array (header:1) buscando la fila de encabezados por
// contener alguno de los headerHints (normalizados). Compartido por los
// parsers de facturación e ingresos, ambos históricos (archivo de 2022+
// exportado del ERP con menos columnas que el scraper actual).
function readSheetRows(
  allRows: unknown[][],
  headerHints: string[]
): { headerRow: string[]; dataRows: unknown[][] } {
  const headerRowIdx = allRows.findIndex(
    (row) =>
      Array.isArray(row) &&
      row.some((cell) => headerHints.includes(normHeader(String(cell ?? ""))))
  );
  if (headerRowIdx === -1) {
    throw new Error("No se encontró la fila de encabezados en el archivo.");
  }
  const headerRow: string[] = (allRows[headerRowIdx] ?? []).map((c) => String(c ?? ""));
  return { headerRow, dataRows: allRows.slice(headerRowIdx + 1) };
}

export async function parseFacturacionFile(file: File): Promise<FacturacionInsert[]> {
  const buf = await readAsBuffer(file);
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });

  const { headerRow, dataRows } = readSheetRows(allRows, ["SERNUM", "NDCTO", "MINORISTA", "CLIENTE"]);
  function colIdx(patterns: string[]): number {
    for (const p of patterns) {
      const idx = headerRow.findIndex((h) => normHeader(h) === normHeader(p));
      if (idx !== -1) return idx;
    }
    return headerRow.findIndex((h) => patterns.some((p) => normHeader(h).includes(normHeader(p))));
  }

  const idxSerNum   = colIdx(["SER-NUM", "N°DCTO", "NDCTO"]);
  const idxCodigo   = colIdx(["CODIGO"]);
  const idxTienda   = colIdx(["TIENDA"]);
  const idxTipoCmp  = colIdx(["COMPROBANTE", "DCTO"]);
  const idxCliente  = colIdx(["MINORISTA", "CLIENTE"]);
  const idxMayor    = colIdx(["MAYORISTA"]);
  const idxFecha    = colIdx(["FECHA"]);
  const idxMoneda   = colIdx(["MONEDA"]);
  const idxSubtotal = colIdx(["SUBTOTAL"]);
  const idxDscto    = colIdx(["DSCTO"]);
  const idxNotCre   = colIdx(["NOT.CRE.", "NOTCRE"]);
  const idxBi       = colIdx(["B.I.", "BI"]);
  const idxIgv      = colIdx(["IGV"]);
  const idxTotal    = colIdx(["TOTAL"]);
  const idxEfectivo = colIdx(["EFECTIVO"]);
  const idxTarjeta  = colIdx(["TARJETA"]);
  const idxTransf   = colIdx(["TRANSFERENCIA"]);
  const idxDetTarj  = colIdx(["DETALLE VENTA CON TARJETA"]);
  const idxVendedor = colIdx(["VENDEDOR"]);
  const idxNc       = colIdx(["NC"]);

  if (idxSerNum === -1) throw new Error("No se encontró columna SER-NUM / N°DCTO.");
  if (idxFecha === -1) throw new Error("No se encontró columna FECHA.");

  const at = (row: unknown[], idx: number): unknown => (idx !== -1 ? row[idx] : null);
  const result: FacturacionInsert[] = [];

  for (const row of dataRows) {
    if (!Array.isArray(row)) continue;
    const ser_num = str(row[idxSerNum]);
    if (!ser_num) continue;
    const fecha = parseDate(row[idxFecha]);
    if (!fecha) continue;

    result.push({
      ser_num,
      codigo: str(at(row, idxCodigo)),
      tienda: str(at(row, idxTienda)),
      tipo_comprobante: str(at(row, idxTipoCmp)),
      cliente: str(at(row, idxCliente)),
      mayorista: str(at(row, idxMayor)),
      fecha,
      moneda: str(at(row, idxMoneda)),
      subtotal: num(at(row, idxSubtotal)),
      dscto: num(at(row, idxDscto)),
      not_cre: num(at(row, idxNotCre)),
      bi: num(at(row, idxBi)),
      igv: num(at(row, idxIgv)),
      total: num(at(row, idxTotal)) ?? 0,
      efectivo: num(at(row, idxEfectivo)),
      tarjeta: num(at(row, idxTarjeta)),
      transferencia: num(at(row, idxTransf)),
      detalle_tarjeta: str(at(row, idxDetTarj)),
      vendedor: str(at(row, idxVendedor)),
      nc: str(at(row, idxNc)),
      fuente: "historico",
    });
  }

  return result;
}

export async function parseIngresosFile(file: File): Promise<IngresoInsert[]> {
  const buf = await readAsBuffer(file);
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });

  const { headerRow, dataRows } = readSheetRows(allRows, ["CODIGO", "CODIGOINTERNO"]);
  function colIdx(patterns: string[]): number {
    for (const p of patterns) {
      const idx = headerRow.findIndex((h) => normHeader(h) === normHeader(p));
      if (idx !== -1) return idx;
    }
    return headerRow.findIndex((h) => patterns.some((p) => normHeader(h).includes(normHeader(p))));
  }

  const idxCodigo    = colIdx(["CODIGO", "CÓDIGO INTERNO", "CODIGO INTERNO"]);
  const idxEmp       = colIdx(["EMP"]);
  const idxAlm       = colIdx(["ALM", "ALMC"]);
  const idxIngSal    = colIdx(["ING/SAL"]);
  const idxTipoMov   = colIdx(["TIPO MOV."]);
  const idxSerie     = colIdx(["N° DCTO", "SERIE-NÚMERO", "SERIE-NUMERO"]);
  const idxEmision   = colIdx(["EMISION", "EMISIÓN"]);
  const idxMoneda    = colIdx(["MONEDA", "MOND."]);
  const idxImporte   = colIdx(["IMPORTE"]);
  const idxSubtotal  = colIdx(["SUBTOTAL"]);
  const idxIgv       = colIdx(["IGV"]);
  const idxDscto     = colIdx(["DSCTO"]);
  const idxTotal     = colIdx(["TOTAL"]);
  const idxRuc       = colIdx(["RUC"]);
  const idxProveedor = colIdx(["PROVEEDOR"]);
  const idxCmpl      = colIdx(["CMPL"]);
  const idxMcdr      = colIdx(["MCDR"]);
  const idxOrdCompra = colIdx(["ORD.COMPRA"]);

  if (idxCodigo === -1) throw new Error("No se encontró columna CODIGO / CÓDIGO INTERNO.");
  if (idxEmision === -1) throw new Error("No se encontró columna EMISION.");

  const at = (row: unknown[], idx: number): unknown => (idx !== -1 ? row[idx] : null);
  const result: IngresoInsert[] = [];

  for (const row of dataRows) {
    if (!Array.isArray(row)) continue;
    const codigo_interno = str(row[idxCodigo]);
    if (!codigo_interno) continue;
    const emision = parseDate(row[idxEmision]);
    if (!emision) continue;

    result.push({
      codigo_interno,
      emp: str(at(row, idxEmp)),
      almacen: str(at(row, idxAlm)),
      ing_sal: str(at(row, idxIngSal)),
      tipo_mov: str(at(row, idxTipoMov)),
      serie_numero: str(at(row, idxSerie)),
      emision,
      moneda: str(at(row, idxMoneda)),
      importe: num(at(row, idxImporte)),
      subtotal: num(at(row, idxSubtotal)),
      igv: num(at(row, idxIgv)),
      dscto: num(at(row, idxDscto)),
      total: num(at(row, idxTotal)),
      ruc: str(at(row, idxRuc)),
      proveedor: str(at(row, idxProveedor)),
      cmpl: str(at(row, idxCmpl)),
      mcdr: str(at(row, idxMcdr)),
      ord_compra: str(at(row, idxOrdCompra)),
      fuente: "historico",
    });
  }

  return result;
}
