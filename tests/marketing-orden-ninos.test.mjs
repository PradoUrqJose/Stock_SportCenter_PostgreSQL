import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";

registerHooks({ resolve(specifier, context, next) {
  return next(specifier === "./marketing-catalogo" ? `${specifier}.ts` : specifier, context);
} });
const { construirBorrador, conFijasAutomaticas, ordenGenerosDelCatalogo } = await import("../src/lib/marketing-catalogo.ts");
const { sincronizarBorrador } = await import("../src/lib/marketing-sincronizar.ts");
const orden = ordenGenerosDelCatalogo("ninos");
const item = (cod, genero, marca = "ADIDAS", modelo = "MODELO") => ({ cod_universal: cod, genero, marca, modelo, precio_venta: 100, tallas: { "5": 1 }, stock_total: 1 });
const crear = (items, tipo = "ninos") => construirBorrador(items, new Map(), (marca) => `plantilla-${marca}`, undefined, ordenGenerosDelCatalogo(tipo));
const lista = (b) => b.paginas.filter((p) => p.tipo === "producto").map((p) => b.productos[p.prod]);
const claves = (b) => lista(b).map((p) => `${p.genero}/${p.marca}/${p.cod}`);
const fija = (id) => ({ id, tipo: "fija", imagen: `paginas-fijas/${id}`, ancho: 2000, alto: 1125 });

test("Niños genera primero Infante, luego Preescolar y al final Junior; marca, modelo y código siguen ascendentes", () => {
  const b = crear([
    item("J1", "JUNIOR"), item("P1", "PRESCO"),
    item("I4", "INFANTE", "NIKE", "A"), item("I3", "INFANTE", "ADIDAS", "B"),
    item("I2", "INFANTE", "ADIDAS", "A"), item("I1", "INFANTE", "ADIDAS", "A"),
  ]);
  assert.deepEqual(claves(b), ["INFANTE/ADIDAS/I1", "INFANTE/ADIDAS/I2", "INFANTE/ADIDAS/I3", "INFANTE/NIKE/I4", "PRESCO/ADIDAS/P1", "JUNIOR/ADIDAS/J1"]);
  const biblioteca = [
    { ...fija("portada"), tipo: "portada", auto_tipo: "ninos" },
    { ...fija("cierre"), tipo: "terminos", auto_tipo: "ninos", auto_posicion: "final" },
  ];
  const completo = conFijasAutomaticas(b, "ninos", biblioteca);
  assert.equal(completo.paginas[0].imagen, "paginas-fijas/portada");
  assert.equal(completo.paginas.at(-1).imagen, "paginas-fijas/cierre");
  assert.deepEqual(claves(completo), claves(b));
});

test("el mismo código en distintas edades conserva una página por edad y los demás catálogos siguen por marca", () => {
  const items = [item("X", "JUNIOR", "ADIDAS"), item("X", "INFANTE", "NIKE"), item("X", "PRESCO", "PUMA")];
  assert.deepEqual(lista(crear(items)).map((p) => p.genero), ["INFANTE", "PRESCO", "JUNIOR"]);
  assert.deepEqual(lista(crear(items, "futbol")).map((p) => p.marca), ["ADIDAS", "NIKE", "PUMA"]);
});

test("sincronizar inserta nuevos de la misma marca en su edad, sin mezclarlos con otras edades", () => {
  const anteriores = [item("I1", "INFANTE"), item("P1", "PRESCO"), item("J1", "JUNIOR")];
  const actual = crear(anteriores);
  actual.paginas = [fija("portada"), ...actual.paginas, fija("cierre")];
  const fresco = crear([...anteriores, item("I0", "INFANTE"), item("P0", "PRESCO"), item("J0", "JUNIOR"), item("Z", "INFANTE", "NIKE")]);
  const { borrador, informe } = sincronizarBorrador(actual, fresco, "2026-10-30T20:00:00Z", orden);
  assert.deepEqual(claves(borrador), ["INFANTE/ADIDAS/I0", "INFANTE/ADIDAS/I1", "INFANTE/NIKE/Z", "PRESCO/ADIDAS/P0", "PRESCO/ADIDAS/P1", "JUNIOR/ADIDAS/J0", "JUNIOR/ADIDAS/J1"]);
  assert.equal(borrador.paginas[0].id, "portada");
  assert.equal(borrador.paginas.at(-1).id, "cierre");
  assert.equal(informe.nuevos.length, 4);
  const repetida = sincronizarBorrador(borrador, fresco, "2026-10-30T21:00:00Z", orden);
  assert.deepEqual(repetida.borrador.paginas, borrador.paginas);
  assert.equal(repetida.informe.nuevos.length, 0);
});

test("una edad que estaba vacía aparece en su lugar aunque su marca sea alfabéticamente posterior", () => {
  for (const genero of orden) {
    const anteriores = orden.filter((g) => g !== genero).map((g) => item(g, g));
    const { borrador } = sincronizarBorrador(crear(anteriores), crear([...anteriores, item("NUEVO", genero, "SKECHERS")]), "ahora", orden);
    assert.deepEqual(lista(borrador).map((p) => p.genero), ["INFANTE", "PRESCO", "JUNIOR"]);
  }
});

test("reactivar respeta la edad, conserva los ajustes y las quitadas manuales siguen fuera", () => {
  const items = [item("I", "INFANTE"), item("P", "PRESCO"), item("J", "JUNIOR")];
  const actual = crear(items);
  const [infante, presco, junior] = actual.paginas;
  actual.paginas = [junior];
  actual.quitadas = [{ ...infante, motivo: "sync", ajuste: { dx: 1, dy: 2, s: 1.2 } }, presco];
  const { borrador, informe } = sincronizarBorrador(actual, crear(items), "ahora", orden);
  assert.deepEqual(lista(borrador).map((p) => p.genero), ["INFANTE", "JUNIOR"]);
  assert.deepEqual(borrador.paginas[0].ajuste, { dx: 1, dy: 2, s: 1.2 });
  assert.equal(borrador.paginas[0].id, infante.id);
  assert.equal(informe.reactivados.length, 1);
  assert.equal(informe.nuevos.length, 0);
  assert.deepEqual(borrador.quitadas, [presco]);
});

test("sincronizar conserva el orden manual existente y la inserción habitual en otros catálogos", () => {
  const items = [item("B", "HOMBRE", "NIKE"), item("A", "HOMBRE", "ADIDAS")];
  const actual = crear(items, "hombre");
  actual.paginas.reverse();
  const ids = actual.paginas.map((p) => p.id);
  const { borrador } = sincronizarBorrador(actual, crear([...items, item("C", "HOMBRE", "NIKE")], "hombre"), "ahora");
  assert.deepEqual(borrador.paginas.filter((p) => ids.includes(p.id)).map((p) => p.id), ids);
  assert.deepEqual(lista(borrador).map((p) => p.cod), ["B", "C", "A"]);
});
