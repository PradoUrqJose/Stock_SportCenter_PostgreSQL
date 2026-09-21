// El Excel de equivalencias de tallas (SOLO servidor): plantilla vacía para llenar y las tablas actuales en el mismo formato.
// Una fila por talla: MARCA | GENERO | PERU | USA | PIE_CM. Se lee de vuelta en el navegador (ver marketing-tallas-archivo.ts).
import ExcelJS from "exceljs";
import { GENEROS_TALLAS, type TablaTallas } from "@/lib/marketing-tallas";

export const ENCABEZADOS_TALLAS = ["MARCA", "GENERO", "PERU", "USA", "PIE_CM"] as const;

export async function libroDeTallas(tablas: readonly TablaTallas[]): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Equivalencias", { views: [{ state: "frozen", ySplit: 1 }] });
  hoja.columns = [
    { header: "MARCA", key: "marca", width: 18 },
    { header: "GENERO", key: "genero", width: 14 },
    { header: "PERU", key: "peru", width: 10, style: { numFmt: "0.0" } },
    { header: "USA", key: "usa", width: 10, style: { numFmt: "@" } },
    { header: "PIE_CM", key: "pie_cm", width: 10, style: { numFmt: "0.0" } },
  ];
  hoja.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
  });
  for (const t of tablas) for (const f of t.filas) hoja.addRow({ marca: t.marca, genero: t.genero, peru: f.peru, usa: f.usa, pie_cm: f.pie_cm ?? undefined });
  // Lista desplegable de géneros (sin bloquear otras escrituras: «DAMA» y «PRE ESCOLAR» también se entienden).
  for (let i = 2; i <= 1000; i++) {
    hoja.getCell(`B${i}`).dataValidation = { type: "list", allowBlank: true, showErrorMessage: false, formulae: [`"${GENEROS_TALLAS.join(",")}"`] };
  }

  const ayuda = libro.addWorksheet("Instrucciones");
  ayuda.getColumn(1).width = 110;
  [
    "EQUIVALENCIA DE TALLAS",
    "",
    "Llena la hoja «Equivalencias»: una fila por talla, con estas columnas:",
    "  MARCA   la marca como sale en el sistema (ADIDAS, NIKE, NEW BALANCE…).",
    `  GENERO  ${GENEROS_TALLAS.join(", ")}. También se entienden DAMA (= MUJER) y PRE ESCOLAR (= PRESCO).`,
    "  PERU    la talla peruana (por ejemplo 41.5).",
    "  USA     la talla USA tal como llega del ERP (por ejemplo 8, 10.5, 1). La «Y» de las tallas juveniles (1Y, 3.5Y) es opcional.",
    "  PIE_CM  el largo del pie en cm. Es opcional: puede quedar vacío.",
    "",
    "Reglas:",
    "  · Cada marca y género tiene su propia tabla. Al subir el archivo, la tabla de cada marca y género que venga en él REEMPLAZA a la que ya existía;",
    "    las marcas y géneros que no vengan en el archivo no se tocan.",
    "  · Dentro de una marca y género, cada talla USA va una sola vez.",
    "  · Solo se convierten tallas de calzado. La ropa (S, M, L…) y los accesorios no llevan equivalencia.",
    "  · Los productos UNISEX usan la tabla de HOMBRE de su marca, salvo que le pongas una tabla UNISEX propia.",
    "  · Si una marca y género no tienen equivalencia, sus catálogos salen con talla USA y el sistema lo avisa.",
    "",
    "Puedes bajar un archivo con las tablas actuales, editarlo y volver a subirlo.",
  ].forEach((t, i) => {
    const c = ayuda.getCell(i + 1, 1);
    c.value = t;
    if (i === 0) c.font = { bold: true, size: 14 };
  });
  return Buffer.from(await libro.xlsx.writeBuffer());
}
