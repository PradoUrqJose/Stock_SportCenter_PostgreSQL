import ExcelJS from "exceljs";
import { getSession, isAdminRole } from "@/lib/auth";
import { fetchUnicos } from "@/lib/queries/unicos";
import { DISCOUNT_COLORS, getDiscountColor } from "@/lib/discount-colors";

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

export async function GET() {
  const session = await getSession();
  if (!session || !isAdminRole(session.rol)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rows = await fetchUnicos();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Únicos");

  sheet.columns = [
    { header: "Código", key: "cod_universal", width: 18 },
    { header: "Marca", key: "marca", width: 16 },
    { header: "Modelo", key: "modelo", width: 18 },
    { header: "Género", key: "genero", width: 10 },
    { header: "Talla", key: "talla", width: 10 },
    { header: "Color", key: "color", width: 14 },
    { header: "Izq", key: "alm_izq", width: 10 },
    { header: "Der", key: "alm_der", width: 10 },
    { header: "Antigüedad", key: "antiguedad_dias", width: 12 },
    { header: "Precio", key: "precio_lista", width: 12 },
    { header: "Descuento", key: "descuento", width: 12 },
  ];

  sheet.getRow(1).eachCell((cell) => {
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = HEADER_FILL_BLACK;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });

  rows.forEach((r, i) => {
    const row = sheet.addRow({
      cod_universal: r.cod_universal,
      marca: r.marca ?? "—",
      modelo: r.modelo ?? "—",
      genero: r.genero,
      talla: r.talla ?? "—",
      color: r.color ?? "—",
      alm_izq: r.alm_izq ?? "—",
      alm_der: r.alm_der ?? "—",
      antiguedad_dias: r.antiguedad_dias ?? null,
      precio_lista: r.precio_lista,
      descuento: r.descuento / 100,
    });

    const isStripe = i % 2 === 1;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = ALL_BORDERS;
      cell.alignment = { ...cell.alignment, vertical: "middle" };
      if (isStripe) cell.fill = STRIPE_FILL;
    });

    const izqCell = row.getCell(7);
    izqCell.alignment = { vertical: "middle", horizontal: "center" };

    const derCell = row.getCell(8);
    derCell.alignment = { vertical: "middle", horizontal: "center" };

    const antiguedadCell = row.getCell(9);
    antiguedadCell.alignment = { vertical: "middle", horizontal: "center" };

    const precioCell = row.getCell(10);
    precioCell.numFmt = "#,##0.00";
    precioCell.alignment = { vertical: "middle", horizontal: "right" };

    const descuentoCell = row.getCell(11);
    descuentoCell.numFmt = "0%";
    descuentoCell.alignment = { vertical: "middle", horizontal: "center" };
    const color = getDiscountColor(Math.round(r.descuento));
    if (color) {
      descuentoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color.excel } };
      descuentoCell.font = {
        bold: true,
        color: { argb: color.excel === DISCOUNT_COLORS[20].excel ? "FFC00000" : "FFFFFFFF" },
      };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="unicos-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
