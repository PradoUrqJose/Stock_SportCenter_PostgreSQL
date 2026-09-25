import assert from "node:assert/strict";
import { test } from "node:test";
import { guardaEnBiblioteca, insertarEnOrden, posicionAntesDeMarca, posicionEnEditor, validarArchivoPagina } from "../src/components/admin/marketing/selector-pagina-fija-logica.ts";

test("la subida del editor conserva la opción de catálogo y permite guardar el diseño en biblioteca", () => {
  assert.equal(guardaEnBiblioteca("catalogo", true), false);
  assert.equal(guardaEnBiblioteca("ambos", false), false);
  assert.equal(guardaEnBiblioteca("ambos", true), true);
  assert.equal(guardaEnBiblioteca("biblioteca", false), true);
});

test("Agregar página desde el editor respeta inicio, selección y final", () => {
  assert.equal(posicionEnEditor("inicio", 3, 10), 0);
  assert.equal(posicionEnEditor("despues", 3, 10), 4);
  assert.equal(posicionEnEditor("despues", -1, 10), 10);
  assert.equal(posicionEnEditor("final", 3, 10), 10);
});

test("un diseño subido desde Preview entra en el hueco elegido una sola vez", () => {
  assert.deepEqual(insertarEnOrden(["portada", "productos", "cierre"], "separador", 2), ["portada", "productos", "separador", "cierre"]);
  assert.deepEqual(insertarEnOrden(["portada", "productos"], "portada", 1), ["portada", "productos"]);
});

test("el mismo selector acepta imágenes arrastradas y rechaza formatos, archivos vacíos y tamaños excesivos", () => {
  assert.equal(validarArchivoPagina("image/png", 1024), null);
  assert.equal(validarArchivoPagina("image/jpeg", 4 * 1024 * 1024), null);
  assert.equal(validarArchivoPagina("image/webp", 1024), null);
  assert.match(validarArchivoPagina("application/pdf", 1024), /JPG, PNG o WebP/);
  assert.match(validarArchivoPagina("image/png", 0), /vacía/);
  assert.match(validarArchivoPagina("image/png", 4 * 1024 * 1024 + 1), /4 MB/);
});

test("subir el separador desde Preview lo ubica antes de la marca en el mismo selector", () => {
  const orden = ["portada", "productos:NIKE", "productos:ADIDAS", "cierre"];
  assert.equal(posicionAntesDeMarca(orden, "productos:ADIDAS"), 2);
  assert.deepEqual(insertarEnOrden(orden, "separador-adidas", posicionAntesDeMarca(orden, "productos:ADIDAS")), ["portada", "productos:NIKE", "separador-adidas", "productos:ADIDAS", "cierre"]);
  assert.equal(posicionAntesDeMarca(orden, "productos:PUMA"), orden.length);
});
