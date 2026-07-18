import ExcelJS from "exceljs";
import { getSession, isAdminRole } from "@/lib/auth";
import { fetchIngresos } from "@/lib/queries/ingresos";
import { formatDateDDMMYY } from "@/lib/utils";

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

  const rows = await fetchIngresos();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Ingresos");

  sheet.columns = [
    { header: "Código", key: "codigo_interno", width: 16 },
    { header: "Alm", key: "almacen", width: 10 },
    { header: "N. Documento", key: "serie_numero", width: 18 },
    { header: "Fecha", key: "emision", width: 12 },
    { header: "Total", key: "total", width: 14 },
    { header: "RUC", key: "ruc", width: 14 },
    { header: "Proveedor", key: "proveedor", width: 28 },
  ];

  sheet.getRow(1).eachCell((cell) => {
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = HEADER_FILL_BLACK;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });

  rows.forEach((r, i) => {
    const row = sheet.addRow({
      codigo_interno: r.codigo_interno,
      almacen: r.almacen ?? "—",
      serie_numero: r.serie_numero ?? "—",
      emision: formatDateDDMMYY(r.emision),
      total: r.total,
      ruc: r.ruc ?? "—",
      proveedor: r.proveedor ?? "—",
    });

    const isStripe = i % 2 === 1;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = ALL_BORDERS;
      cell.alignment = { ...cell.alignment, vertical: "middle" };
      if (isStripe) cell.fill = STRIPE_FILL;
    });

    const totalCell = row.getCell(5);
    totalCell.numFmt = "#,##0.00";
    totalCell.alignment = { vertical: "middle", horizontal: "right" };
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ingresos-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
