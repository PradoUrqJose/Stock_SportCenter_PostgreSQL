import ExcelJS from "exceljs";
import { getSession, isAdminRole } from "@/lib/auth";
import { autoFitColumns } from "@/lib/excel";
import { fetchFacturacion } from "@/lib/queries/facturacion";

const HEADER_FILL_BLUE: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E40AF" },
};
const STRIPE_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF9FAFB" },
};
const THIN_BORDER = { style: "thin", color: { argb: "FFE5E7EB" } } as const;
const ALL_BORDERS = { top: THIN_BORDER, left: THIN_BORDER, bottom: THIN_BORDER, right: THIN_BORDER };

function toDateValue(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export async function GET() {
  const session = await getSession();
  if (!session || !isAdminRole(session.rol)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rows = [...(await fetchFacturacion())].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.ser_num.localeCompare(b.ser_num)
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Facturación");

  sheet.columns = [
    { header: "N°", key: "numero" },
    { header: "MAYORISTA", key: "mayorista" },
    { header: "MINORISTA", key: "minorista" },
    { header: "COMPROBANTE", key: "comprobante" },
    { header: "FECHA", key: "fecha" },
    { header: "TOTAL", key: "total" },
    { header: "SER-NUM", key: "ser_num" },
  ];

  sheet.getRow(1).eachCell((cell) => {
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = HEADER_FILL_BLUE;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });

  rows.forEach((record, index) => {
    const row = sheet.addRow({
      numero: index + 1,
      mayorista: "JORKEL SPORT S.A.C.",
      minorista: record.cliente ?? "—",
      comprobante: record.tipo_comprobante ?? "—",
      fecha: toDateValue(record.fecha),
      total: record.total,
      ser_num: record.ser_num,
    });

    const isStripe = index % 2 === 1;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = ALL_BORDERS;
      cell.alignment = { ...cell.alignment, vertical: "middle" };
      if (isStripe) cell.fill = STRIPE_FILL;
    });

    const numeroCell = row.getCell(1);
    numeroCell.alignment = { vertical: "middle", horizontal: "center" };

    const fechaCell = row.getCell(5);
    fechaCell.numFmt = "dd/mm/yyyy";
    fechaCell.alignment = { vertical: "middle", horizontal: "center" };

    const totalCell = row.getCell(6);
    totalCell.numFmt = '"S/" #,##0.00';
    totalCell.alignment = { vertical: "middle", horizontal: "right" };
  });

  const lastRow = rows.length + 1;
  const last40TopRow = Math.max(2, lastRow - 39);
  sheet.autoFilter = { from: "A1", to: `G${lastRow}` };
  sheet.views = [
    {
      state: "frozen",
      ySplit: 1,
      topLeftCell: `A${last40TopRow}`,
      activeCell: `A${lastRow}`,
      zoomScale: 150,
    },
  ];
  autoFitColumns(sheet);

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="facturacion-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
