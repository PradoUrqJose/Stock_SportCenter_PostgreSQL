import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { excelProductosSinImagen } from "../src/lib/marketing-imagenes-excel.ts";
import {
  productosRevisionImagen,
  filtrarRevisionImagen,
} from "../src/lib/marketing-imagenes-pendientes.ts";

const consulta = { fecha: "2026-10-31T04:07:00Z", almacenes: ["JAL1", "T01"] };
const producto = (codigo, extra = {}) => ({
  codigo,
  marcas: ["CIRCA"],
  modelos: ["MODELO"],
  generos: ["JUNIOR"],
  categorias: ["MODA"],
  colores: ["NEGRO"],
  stock: 12,
  fichasRepetidas: false,
  ...extra,
});

test("el archivo es un XLSX real con todos los resultados, códigos de texto y stock numérico", async () => {
  const productos = Array.from({ length: 120 }, (_, i) =>
    producto(String(i).padStart(6, "0")),
  );
  const bytes = await excelProductosSinImagen(productos, consulta);
  assert.equal(bytes.subarray(0, 2).toString(), "PK");
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(bytes);
  const hoja = libro.getWorksheet("Productos sin imagen");
  assert.equal(hoja.rowCount, 121);
  assert.equal(hoja.getCell("A2").value, "000000");
  assert.equal(hoja.getCell("A2").numFmt, "@");
  assert.equal(hoja.getCell("A121").value, "000119");
  assert.equal(hoja.getCell("G2").value, 12);
  assert.equal(hoja.views[0].state, "frozen");
  assert.equal(hoja.views[0].ySplit, 1);
  assert(hoja.autoFilter);
  const info = libro.getWorksheet("Información");
  assert(info.getCell("B1").text.includes("23:07"));
  assert.equal(info.getCell("B2").value, "JAL1, T01");
  assert.equal(info.getCell("B3").value, 120);
});

test("textos parecidos a fórmulas siguen como texto y el stock ambiguo se conserva sin inventar cantidades", async () => {
  const bytes = await excelProductosSinImagen(
    [
      producto("FPF 02092", {
        modelos: ['=HIPERVINCULO("ejemplo")'],
        stock: null,
        fichasRepetidas: true,
      }),
    ],
    consulta,
  );
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(bytes);
  const hoja = libro.worksheets[0];
  assert.equal(hoja.getCell("A2").value, "FPF 02092");
  assert.equal(hoja.getCell("C2").type, ExcelJS.ValueType.String);
  assert.equal(hoja.getCell("C2").value, '=HIPERVINCULO("ejemplo")');
  assert.equal(hoja.getCell("G2").value, "Por revisar en ERP");
});

test("se exporta exactamente la selección filtrada y también se admite un resultado vacío", async () => {
  const productos = productosRevisionImagen([
    {
      cod_universal: "A",
      genero: "HOMBRE",
      marca: "CIRCA",
      modelo: "A",
      categoria: "MODA",
      stock_total: 2,
    },
    {
      cod_universal: "B",
      genero: "HOMBRE",
      marca: "NIKE",
      modelo: "B",
      categoria: "MODA",
      stock_total: 3,
    },
  ]);
  const filtrados = filtrarRevisionImagen(productos, {
    q: "",
    marca: "CIRCA",
    genero: "",
    categoria: "",
    orden: "codigo",
  });
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await excelProductosSinImagen(filtrados, consulta));
  assert.equal(libro.worksheets[0].rowCount, 2);
  assert.equal(libro.worksheets[0].getCell("A2").value, "A");
  const vacio = new ExcelJS.Workbook();
  await vacio.xlsx.load(
    await excelProductosSinImagen([], { fecha: null, almacenes: [] }),
  );
  assert.equal(vacio.worksheets[0].rowCount, 1);
  assert.equal(vacio.getWorksheet("Información").getCell("B3").value, 0);
});
