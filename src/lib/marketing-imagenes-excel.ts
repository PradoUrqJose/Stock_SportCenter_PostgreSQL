import ExcelJS from "exceljs";
import type { ProductoRevisionImagen } from "./marketing-imagenes-pendientes";

export async function excelProductosSinImagen(
  productos: readonly ProductoRevisionImagen[],
  consulta: { fecha: string | null; almacenes: string[]; imagenesVerificadasAl?: string },
): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Sport Center";
  const hoja = libro.addWorksheet("Productos sin imagen", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  hoja.columns = [
    { header: "Código", key: "codigo", width: 23, style: { numFmt: "@" } },
    { header: "Marca", key: "marca", width: 22 },
    { header: "Modelo", key: "modelo", width: 44 },
    { header: "Género / edad", key: "genero", width: 26 },
    { header: "Categoría", key: "categoria", width: 24 },
    { header: "Color", key: "color", width: 24 },
    { header: "Stock ERP", key: "stock", width: 18 },
  ];
  for (const p of productos) {
    const fila = hoja.addRow({
      codigo: p.codigo,
      marca: p.marcas.join(" / "),
      modelo: p.modelos.join(" / "),
      genero: p.generos.join(" / "),
      categoria: p.categorias.join(" / "),
      color: p.colores.join(" / "),
      stock: p.stock ?? "Por revisar en ERP",
    });
    fila.height = 24;
    fila.eachCell((c) => {
      c.alignment = { vertical: "middle", wrapText: true };
      if (fila.number % 2 === 0)
        c.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
    });
    if (p.stock === null)
      fila.getCell("stock").font = { color: { argb: "FF92400E" } };
  }
  hoja.getRow(1).height = 28;
  hoja.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF18212F" },
    };
    c.alignment = { vertical: "middle" };
  });
  hoja.autoFilter = { from: "A1", to: `G${Math.max(1, productos.length + 1)}` };
  const info = libro.addWorksheet("Información");
  info.columns = [{ width: 28 }, { width: 100 }];
  info.addRows([
    [
      "Consulta del stock (Lima)",
      consulta.fecha
        ? new Intl.DateTimeFormat("es-PE", {
            timeZone: "America/Lima",
            hourCycle: "h23",
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(consulta.fecha))
        : "Sin consulta",
    ],
    ["Almacenes", consulta.almacenes.join(", ")],
    ["Productos exportados", productos.length],
    [
      "Contenido",
      "Todos los productos sin imagen que coinciden con los filtros, no solo la página visible.",
    ],
    [
      "Stock por revisar",
      "El ERP repite una ficha del código y edad. No se suman cantidades ambiguas.",
    ],
  ]);
  if (consulta.imagenesVerificadasAl) info.addRow([
    "Imágenes comprobadas en R2",
    new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hourCycle: "h23", dateStyle: "medium", timeStyle: "medium" }).format(new Date(consulta.imagenesVerificadasAl)),
  ]);
  info.getColumn(1).font = { bold: true };
  info.getColumn(2).alignment = { wrapText: true };
  return Buffer.from(await libro.xlsx.writeBuffer());
}
