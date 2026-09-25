import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  bloquesDe, insertarFija, marcasDe, moverBloque, quitarPagina, rotuloMarca, rutaLogoMarca, svgLogoMarca,
  separarPorMarcas, tieneProductosIntercalados,
} from "../src/components/catalogo/ordenar-catalogo-logica.ts";

const productos = [{ marca: "Adidas" }, { marca: "Adidas" }, { marca: "Nike" }];
const portada = { id: "portada", tipo: "fija", imagen: "portada", ancho: 16, alto: 9 };
const cierre = { id: "cierre", tipo: "fija", imagen: "cierre", ancho: 16, alto: 9 };
const p1 = { id: "p1", tipo: "producto", prod: 0 };
const p2 = { id: "p2", tipo: "producto", prod: 1 };
const p3 = { id: "p3", tipo: "producto", prod: 2 };
const paginas = [portada, p1, p2, p3, cierre];
const adidas = { id: "sa", tipo: "separador_marca", marca: "ADIDAS", imagen: "sep-adidas", ancho: 16, alto: 9 };
const nike = { id: "sn", tipo: "separador_marca", marca: "NIKE", imagen: "sep-nike", ancho: 16, alto: 9 };

test("el borrador abre con un bloque completo de productos entre páginas fijas", () => {
  const bloques = bloquesDe(paginas, productos, false);
  assert.deepEqual(bloques.map((b) => [b.tipo, b.paginas.length]), [["fija", 1], ["productos", 3], ["fija", 1]]);
  assert.equal(tieneProductosIntercalados(paginas), false);
  assert.deepEqual(marcasDe(paginas, productos), ["ADIDAS", "NIKE"]);
});

test("Separar por marcas crea bloques y pone los separadores disponibles delante de cada marca", () => {
  let secuencia = 0;
  const separadas = separarPorMarcas(paginas, productos, [adidas, nike], () => `n${++secuencia}`);
  assert.deepEqual(separadas.map((p) => p.id), ["portada", "n1", "p1", "p2", "n2", "p3", "cierre"]);
  assert.deepEqual(bloquesDe(separadas, productos, true).map((b) => [b.tipo, b.marca, b.paginas.length]), [
    ["fija", undefined, 1], ["fija", undefined, 1], ["marca", "ADIDAS", 2],
    ["fija", undefined, 1], ["marca", "NIKE", 1], ["fija", undefined, 1],
  ]);
  assert.equal(tieneProductosIntercalados(separadas), true);
  assert.equal(separarPorMarcas(separadas, productos, [adidas, nike], () => "extra").some((p) => p.id === "extra"), false);
  const mezcladas = [portada, p1, p3, p2, cierre];
  assert.deepEqual(separarPorMarcas(mezcladas, productos, [], () => "extra").map((p) => p.id), ["portada", "p1", "p2", "p3", "cierre"]);
  const separadorFuera = { id: "sep-nike-existente", tipo: "fija", imagen: nike.imagen, ancho: 16, alto: 9 };
  const corregidas = separarPorMarcas([portada, separadorFuera, p1, p2, p3, cierre], productos, [adidas, nike], () => "nuevo");
  assert.deepEqual(corregidas.map((p) => p.id), ["portada", "nuevo", "p1", "p2", "sep-nike-existente", "p3", "cierre"]);
});

test("mover un bloque conserva juntas las páginas y permite arrastrar o usar flechas", () => {
  const bloques = bloquesDe(paginas, productos, false);
  assert.deepEqual(moverBloque(paginas, bloques, "p1", 3).map((p) => p.id), ["portada", "cierre", "p1", "p2", "p3"]);
  assert.deepEqual(moverBloque(paginas, bloques, "cierre", 1).map((p) => p.id), ["portada", "cierre", "p1", "p2", "p3"]);
});

test("agregar una página la inserta en el hueco elegido", () => {
  assert.deepEqual(insertarFija(paginas, adidas, 1, "nueva").map((p) => p.id), ["portada", "nueva", "p1", "p2", "p3", "cierre"]);
});

test("quitar una página fija la deja restaurable en quitadas", () => {
  const resultado = quitarPagina(paginas, [], "portada");
  assert.deepEqual(resultado.paginas.map((p) => p.id), ["p1", "p2", "p3", "cierre"]);
  assert.deepEqual(resultado.quitadas.map((p) => p.id), ["portada"]);
});

test("la miniatura SVG recibe un rótulo de marca corto y seguro", () => {
  assert.equal(rotuloMarca("  Adidas  "), "ADIDAS");
  assert.equal(rotuloMarca(" "), "SIN MARCA");
  assert.equal(rotuloMarca("a".repeat(40)).length, 24);
  assert.match(svgLogoMarca("Adidas"), /<svg[^>]+xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(svgLogoMarca("Adidas"), />ADIDAS<\/text>/);
  assert.match(svgLogoMarca("<img onerror=1>"), /&lt;IMG ONERROR=1&gt;/);
  assert.doesNotMatch(svgLogoMarca("<img onerror=1>"), /<img/);
});

test("los logos SVG compartidos se resuelven por marca y el resto conserva el respaldo", () => {
  const raiz = new URL("../public/marcas/", import.meta.url);
  const logos = JSON.parse(readFileSync(new URL("fuentes.json", raiz), "utf8"));
  assert.equal(rutaLogoMarca("  NÍKE  ", logos), "/marcas/nike.svg");
  assert.equal(rutaLogoMarca("DON   DOMINGO", logos), "/marcas/don-domingo.svg");
  assert.equal(rutaLogoMarca("MARCA NUEVA", logos), null);
  assert.equal(rutaLogoMarca("NIKE", [{ marca: "NIKE", archivo: "../otro.svg" }]), null);
  for (const { marca, archivo } of logos) {
    assert.equal(rutaLogoMarca(marca, logos), `/marcas/${archivo}`);
    assert.ok(existsSync(new URL(archivo, raiz)), `Falta el SVG de ${marca}: ${archivo}`);
  }
});
