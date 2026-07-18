import ExcelJS from "exceljs";
import { getSession, isAdminRole } from "@/lib/auth";
import { fetchConfirmaciones } from "@/lib/queries/lotes";
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

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  rechazado: "Rechazado",
};

function precioConDescuento(precioLista: number | null, descuento: number): number | null {
  return precioLista !== null ? precioLista * (1 - descuento / 100) : null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !isAdminRole(session.rol)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const loteId = parseInt(id, 10);
  if (isNaN(loteId)) return new Response("Bad Request", { status: 400 });

  const rows = await fetchConfirmaciones(loteId);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Confirmaciones");

  sheet.columns = [
    { header: "Cod. Universal", key: "cod_universal", width: 18 },
    { header: "Marca", key: "marca", width: 16 },
    { header: "Modelo", key: "modelo", width: 18 },
    { header: "Género", key: "genero", width: 10 },
    { header: "P.Antes", key: "precio_antes", width: 14 },
    { header: "D.Antes", key: "descuento_antes", width: 12 },
    { header: "P.Después", key: "precio_despues", width: 14 },
    { header: "D.Después", key: "descuento_despues", width: 12 },
    { header: "Tienda", key: "tienda", width: 12 },
    { header: "Vendedor", key: "vendedor", width: 18 },
    { header: "Estado", key: "estado", width: 14 },
  ];

  sheet.getRow(1).eachCell((cell) => {
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = HEADER_FILL_BLACK;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });

  rows.forEach((r, i) => {
    const row = sheet.addRow({
      cod_universal: r.cod_universal,
      marca: r.snap_marca ?? "—",
      modelo: r.snap_modelo ?? "—",
      genero: r.genero,
      precio_antes: precioConDescuento(r.snap_precio_lista, r.descuento_antes),
      descuento_antes: r.descuento_antes,
      precio_despues: precioConDescuento(r.snap_precio_lista, r.descuento_nuevo),
      descuento_despues: r.descuento_nuevo,
      tienda: r.tienda_nombre,
      vendedor: r.vendedor_nombre ?? r.codigo_usado ?? "—",
      estado: ESTADO_LABEL[r.estado] ?? r.estado,
    });

    const isStripe = i % 2 === 1;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = ALL_BORDERS;
      cell.alignment = { ...cell.alignment, vertical: "middle" };
      if (isStripe) cell.fill = STRIPE_FILL;
    });

    const precioAntesCell = row.getCell(5);
    precioAntesCell.numFmt = "#,##0.00";
    precioAntesCell.alignment = { vertical: "middle", horizontal: "right" };

    const precioDespuesCell = row.getCell(7);
    precioDespuesCell.numFmt = "#,##0.00";
    precioDespuesCell.alignment = { vertical: "middle", horizontal: "right" };

    const tiendaCell = row.getCell(9);
    tiendaCell.alignment = { vertical: "middle", horizontal: "center" };

    for (const [value, colNumber] of [
      [r.descuento_antes, 6],
      [r.descuento_nuevo, 8],
    ] as const) {
      const color = getDiscountColor(Math.round(value));
      const cell = row.getCell(colNumber);
      cell.alignment = { vertical: "middle", horizontal: "center" };
      // valor como fracción real (30% -> 0.3) con formato de porcentaje nativo de Excel,
      // en vez de un string "30%" que Excel marca como "número guardado como texto"
      cell.value = value / 100;
      cell.numFmt = "0%";
      if (color) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color.excel } };
        cell.font = {
          bold: true,
          color: { argb: color.excel === DISCOUNT_COLORS[20].excel ? "FFC00000" : "FFFFFFFF" },
        };
      }
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="confirmaciones-lote-${loteId}.xlsx"`,
    },
  });
}
