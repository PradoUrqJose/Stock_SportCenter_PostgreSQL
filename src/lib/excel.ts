import type ExcelJS from "exceljs";

function cellDisplayText(cell: ExcelJS.Cell): string {
  if (cell.value instanceof Date) return "00/00/0000";

  const numFmt = cell.numFmt ?? "";
  if (typeof cell.value === "number" && numFmt.includes("#,##0.00")) {
    const prefix = numFmt.includes('"S/"') ? "S/ " : "";
    return `${prefix}${cell.value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  return cell.text;
}

export function autoFitColumns(sheet: ExcelJS.Worksheet): void {
  sheet.columns.forEach((column) => {
    let maxLength = 0;

    column.eachCell?.({ includeEmpty: true }, (cell) => {
      maxLength = Math.max(maxLength, cellDisplayText(cell).length);
    });

    column.width = Math.min(255, maxLength + 2);
  });
}
