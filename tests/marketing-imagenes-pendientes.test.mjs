import assert from "node:assert/strict";
import { test } from "node:test";
import {
  productosRevisionImagen,
  sinImagenRegistrada,
  filtrarRevisionImagen,
  csvRevisionImagen,
} from "../src/lib/marketing-imagenes-pendientes.ts";
import {
  codigoValido,
  codigoDesdeArchivo,
} from "../src/lib/marketing-codigos.ts";
import {
  validarStockErp,
  validarIntegridadErp,
} from "../src/lib/marketing-erp-control.ts";

const item = (codigo, genero = "JUNIOR", extra = {}) => ({
  cod_universal: codigo,
  genero,
  marca: "NUEVA MARCA",
  modelo: "MODELO",
  categoria: "MODA",
  color: "NEGRO",
  stock_total: 1,
  tallas: { 5: 1 },
  precio_venta: 0,
  ...extra,
});
const filtros = { q: "", marca: "", genero: "", categoria: "", orden: "stock" };

test("incluye marcas nuevas sin productos importados, plantilla, precio ni catálogo; excluye stock cero", () => {
  const productos = productosRevisionImagen([
    item("NUEVO"),
    item("AGOTADO", "JUNIOR", { stock_total: 0 }),
    item("NEGATIVO", "JUNIOR", { stock_total: -1 }),
  ]);
  assert.deepEqual(
    productos.map((p) => p.codigo),
    ["NUEVO"],
  );
  assert.deepEqual(
    sinImagenRegistrada(productos, []).map((p) => p.codigo),
    ["NUEVO"],
  );
});

test("una fila por código reúne edades y stock; una subida resuelve todas las edades", () => {
  const productos = productosRevisionImagen([
    item(" x ", "JUNIOR"),
    item("X", "INFANTE", { stock_total: 2, tallas: { 5: 2 } }),
  ]);
  assert.equal(productos.length, 1);
  assert.equal(productos[0].stock, 3);
  assert.deepEqual(productos[0].generos, ["INFANTE", "JUNIOR"]);
  assert.equal(sinImagenRegistrada(productos, ["x"]).length, 0);
});

test("las fichas duplicadas se identifican sin inventar cantidades; catálogos mantiene la validación estricta", () => {
  const items = [
    item("DUP"),
    item("DUP", "JUNIOR", { stock_total: 5, tallas: { 5: 5 } }),
  ];
  assert.doesNotThrow(() => validarStockErp(items));
  assert.throws(() => validarIntegridadErp(items), /fichas repetidas/);
  const [p] = productosRevisionImagen(items);
  assert.equal(p.fichasRepetidas, true);
  assert.equal(p.stock, null);
  assert.equal(sinImagenRegistrada([p], []).length, 1);
  assert.throws(
    () => validarStockErp([item("MAL", "JUNIOR", { stock_total: 10 })]),
    /stock por talla/,
  );
});

test("el alias de imagen se cruza con el mismo archivo y conserva los códigos con espacios", () => {
  const productos = productosRevisionImagen([
    item("400497_07"),
    item("FPF 02092"),
  ]);
  assert.deepEqual(
    sinImagenRegistrada(productos, ["400497-07"]).map((p) => p.codigo),
    ["FPF 02092"],
  );
  assert.equal(codigoValido("FPF 02092"), true);
  assert.equal(codigoDesdeArchivo("fpf 02092.png"), "FPF 02092");
  for (const c of [
    "../SECRETO",
    "A/B",
    "A\\B",
    "A..B",
    "A?x=1",
    "A#x",
    "A\nB",
    "A".repeat(81),
  ])
    assert.equal(codigoValido(c), false, c);
});

test("los filtros se combinan y ordenar no modifica el inventario guardado", () => {
  const productos = productosRevisionImagen([
    item("A", "JUNIOR", { modelo: "CORRER", stock_total: 4 }),
    item("B", "INFANTE", { marca: "OTRA", stock_total: 12 }),
    item("C", "JUNIOR", { categoria: "FUTBOL", stock_total: 9 }),
  ]);
  assert.deepEqual(
    filtrarRevisionImagen(productos, filtros).map((p) => p.codigo),
    ["B", "C", "A"],
  );
  assert.deepEqual(
    filtrarRevisionImagen(productos, {
      ...filtros,
      q: " correr ",
      marca: "NUEVA MARCA",
      genero: "JUNIOR",
      categoria: "MODA",
    }).map((p) => p.codigo),
    ["A"],
  );
  assert.deepEqual(
    filtrarRevisionImagen(productos, {
      ...filtros,
      genero: "INFANTE",
      categoria: "FUTBOL",
    }),
    [],
  );
  assert.deepEqual(
    productos.map((p) => p.codigo),
    ["A", "B", "C"],
  );
});

test("el CSV exporta toda la selección, conserva códigos y neutraliza fórmulas", () => {
  const productos = productosRevisionImagen(
    Array.from({ length: 120 }, (_, i) =>
      item(`COD-${i}`, "JUNIOR", { modelo: '=HIPERVINCULO("peligro")' }),
    ),
  );
  const csv = csvRevisionImagen(productos);
  assert(csv.startsWith("\uFEFF"));
  assert.equal(csv.split("\r\n").length, 121);
  assert(csv.includes('"\'=HIPERVINCULO(""PELIGRO"")"'));
  assert(csv.includes('"COD-119"'));
});
