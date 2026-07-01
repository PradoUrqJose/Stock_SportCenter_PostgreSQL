import ExcelJS from "exceljs";
import { getSession, isAdminRole } from "@/lib/auth";
import { db, toPlain } from "@/lib/db";
import { DISCOUNT_COLORS, getDiscountColor, type DiscountLevel } from "@/lib/discount-colors";

type CatalogoRow = {
  cod_universal: string;
  marca: string | null;
  modelo: string | null;
  genero: string;
  categoria: string | null;
  color: string | null;
  grupo: string | null;
  stock_total: number;
  precio_lista: number;
  descuento: number;
  imagen_url: string | null;
};

const DISCOUNT_LEVELS: DiscountLevel[] = [10, 20, 30, 40, 50, 60, 70];

// Image box = column width (14ch*7=98px) minus 8px padding on every side, anchored via
// exceljs's "twoCell" stretch anchor — no per-image decode needed, which is what made the
// previous client-side export slow.
const PAD_COL_OFF = 45000;
const PAD_ROW_OFF = 38100;
const IMAGE_ROW_HEIGHT = 63;
const IMAGE_FETCH_CONCURRENCY = 30;
const IMAGE_FETCH_TIMEOUT_MS = 8000;

const EXT_MAP: Record<string, "png" | "jpeg" | "gif"> = {
  png: "png",
  jpg: "jpeg",
  jpeg: "jpeg",
  gif: "gif",
};

const HEADER_FILL_BLACK: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF000000" },
};
const STRIPE_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF9FAFB" },
};
const THIN_BORDER = { style: "thin", color: { argb: "FFE5E7EB" } } as const;
const ALL_BORDERS = { top: THIN_BORDER, left: THIN_BORDER, bottom: THIN_BORDER, right: THIN_BORDER };

async function fetchImage(url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    const ext = contentType.split("/")[1]?.split(";")[0]?.toLowerCase();
    const extension = ext ? EXT_MAP[ext] : undefined;
    if (!extension) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, extension };
  } catch {
    return null;
  }
}

async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 1 }, worker));
  return results;
}

export async function GET() {
  const session = await getSession();
  if (!session || !isAdminRole(session.rol)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await db.execute(`
    SELECT p.cod_universal, p.marca, p.modelo, p.genero, p.categoria, p.color, p.grupo,
           p.stock_total, p.precio_lista, p.descuento, pi.imagen_url
    FROM productos p
    LEFT JOIN producto_imagenes pi ON pi.cod_universal = p.cod_universal
    ORDER BY p.marca, p.modelo
  `);
  const productos = toPlain<CatalogoRow>(result.rows);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Catálogo");

  sheet.columns = [
    { header: "Imagen", key: "imagen", width: 14 },
    { header: "Cod. Marca", key: "cod_universal", width: 18 },
    { header: "Marca", key: "marca", width: 16 },
    { header: "Modelo", key: "modelo", width: 18 },
    { header: "Género", key: "genero", width: 14 },
    { header: "Categoría", key: "categoria", width: 14 },
    { header: "Color", key: "color", width: 14 },
    { header: "Grupo", key: "grupo", width: 14 },
    { header: "Cant.", key: "stock_total", width: 10 },
    { header: "P. Lista", key: "precio_lista", width: 14 },
    ...DISCOUNT_LEVELS.map((pct) => ({ header: `${pct}%`, key: `d${pct}`, width: 12 })),
  ];

  sheet.getRow(1).eachCell((cell, colNumber) => {
    cell.alignment = { horizontal: "center", vertical: "middle" };
    const levelIndex = colNumber - 11;
    if (levelIndex >= 0) {
      const pct = DISCOUNT_LEVELS[levelIndex];
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DISCOUNT_COLORS[pct].excel } };
      cell.font = { bold: true, color: { argb: pct === 20 ? "FFC00000" : "FFFFFFFF" } };
    } else {
      cell.fill = HEADER_FILL_BLACK;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    }
  });

  const images = await mapConcurrent(productos, IMAGE_FETCH_CONCURRENCY, (p) =>
    p.imagen_url ? fetchImage(p.imagen_url) : Promise.resolve(null)
  );

  productos.forEach((p, i) => {
    const excelRow = i + 2;
    const activeLevel = getDiscountColor(Math.round(p.descuento))
      ? (Math.round(p.descuento) as DiscountLevel)
      : null;

    const rowData: Record<string, unknown> = {
      imagen: "",
      cod_universal: p.cod_universal,
      marca: p.marca ?? "—",
      modelo: p.modelo ?? "—",
      genero: p.genero,
      categoria: p.categoria ?? "—",
      color: p.color ?? "—",
      grupo: p.grupo ?? "—",
      stock_total: p.stock_total,
      precio_lista: p.precio_lista,
    };
    for (const pct of DISCOUNT_LEVELS) {
      rowData[`d${pct}`] = pct === activeLevel ? p.precio_lista * (1 - pct / 100) : null;
    }

    const row = sheet.addRow(rowData);
    row.height = IMAGE_ROW_HEIGHT;

    const isStripe = excelRow % 2 === 0;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = ALL_BORDERS;
      cell.alignment = { ...cell.alignment, vertical: "middle" };
      const isDiscountCol = colNumber >= 11;
      if (isStripe && !isDiscountCol) cell.fill = STRIPE_FILL;
    });

    const cantCell = row.getCell(9);
    cantCell.numFmt = "#,##0.00";
    cantCell.alignment = { vertical: "middle", horizontal: "right" };

    const listaCell = row.getCell(10);
    listaCell.numFmt = "#,##0.00";
    listaCell.alignment = { vertical: "middle", horizontal: "right" };

    if (activeLevel) {
      const colNumber = 11 + DISCOUNT_LEVELS.indexOf(activeLevel);
      const cell = row.getCell(colNumber);
      const color = DISCOUNT_COLORS[activeLevel];
      cell.numFmt = "#,##0.00";
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color.excel } };
      cell.font = {
        bold: true,
        color: { argb: activeLevel === 20 ? "FFC00000" : "FFFFFFFF" },
      };
    }

    const img = images[i];
    if (img) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const imageId = workbook.addImage({ buffer: img.buffer as any, extension: img.extension });
      sheet.addImage(imageId, {
        tl: { nativeCol: 0, nativeColOff: PAD_COL_OFF, nativeRow: excelRow - 1, nativeRowOff: PAD_ROW_OFF },
        br: { nativeCol: 1, nativeColOff: -PAD_COL_OFF, nativeRow: excelRow, nativeRowOff: -PAD_ROW_OFF },
        editAs: "twoCell",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="catalogo-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
