import assert from "node:assert/strict";
import { test } from "node:test";
import { DIMENSIONES_ERP as dims, claveConsultaErp, opcionesErp, ordenEjecucionErp, planificarConsultas, valorFiltroErp } from "../src/lib/marketing-erp-plan.ts";
import { TIPOS_CATALOGO } from "../src/lib/marketing-catalogo.ts";

const op = (valor, nombre = valor) => ({ valor, nombre });
const opciones = {
  marcas: [op("A"), op("B"), op("NUEVA"), op("NEWBALANCE", "NEW BALANCE")],
  generos: ["HOMBRE", "MUJER", "JUNIOR", "PRESCO", "INFANTE", "UNISEX", "NINOS"].map((v) => op(v, v === "NINOS" ? "NIÑOS" : v)),
  grupos: ["ZAPATILLAS", "ROPA", "PELOTAS"].map((x) => op(x)),
  categorias: [op("MODA"), op("RUNNING"), op("BASKETBALL", "BASQUET"), op("TRAIL RUNN", "TRAIL RUNNING")],
};
const vacio = () => Object.fromEntries(dims.map((d) => [d, []]));
const campos = { marcas: "marca", generos: "genero", grupos: "grupo", categorias: "categoria" };
const puntos = opciones.marcas.flatMap((marca) => opciones.generos.flatMap((genero) => opciones.grupos.flatMap((grupo) => opciones.categorias.map((categoria) => ({ marca: marca.valor, genero: genero.valor, grupo: grupo.valor, categoria: categoria.valor })))));
const conteos = puntos.filter((p) => p.marca !== "NUEVA" && p.genero !== "NINOS").map((p, i) => ({ ...p, n: 2 + i % 11 }));
const cubre = (c, p) => dims.every((d) => !c[d].length || c[d].includes(p[campos[d]]));

for (const [nombre, filas] of [["conteos completos", conteos], ["sin conteos", []], ["conteos subestimados", conteos.map((c) => ({ ...c, n: 1 }))]]) {
  test(`matriz de 81 combinaciones conserva el filtro completo sin solapamientos: ${nombre}`, () => {
    for (let caso = 0; caso < 81; caso++) {
      let codigo = caso;
      const f = vacio();
      for (const d of dims) {
        const seleccion = codigo % 3; codigo = Math.floor(codigo / 3);
        f[d] = seleccion === 0 ? [] : opciones[d].slice(0, seleccion === 1 ? 1 : 3).map((x) => x.valor);
      }
      const plan = planificarConsultas(filas, f, opciones);
      assert.equal(plan.parcial, false);
      assert.ok(plan.consultas.length > 0);
      for (const punto of puntos) {
        assert.equal(plan.consultas.filter((c) => cubre(c, punto)).length, cubre(f, punto) ? 1 : 0, `${nombre}, caso ${caso}, ${JSON.stringify(punto)}`);
      }
    }
  });
}

test("niños y una marca grande usan el mismo algoritmo de tamaño y cobertura", () => {
  const rows = [
    { marca: "A", genero: "JUNIOR", grupo: "ZAPATILLAS", categoria: "MODA", n: 312 },
    { marca: "A", genero: "PRESCO", grupo: "ZAPATILLAS", categoria: "MODA", n: 369 },
    { marca: "B", genero: "INFANTE", grupo: "ZAPATILLAS", categoria: "MODA", n: 179 },
  ];
  const f = { ...vacio(), generos: ["JUNIOR", "PRESCO", "INFANTE"], grupos: ["ZAPATILLAS"] };
  const kids = planificarConsultas(rows, f, opciones);
  assert.equal(kids.consultas.length, 3);
  assert.ok(kids.consultas.every((c) => !c.marcas.length));
  const marca = planificarConsultas(rows.map((r) => ({ ...r, marca: "A" })), { ...vacio(), marcas: ["A"] }, opciones);
  assert.ok(marca.consultas.length > 1, "elegir una marca no debe saltarse el control de tamaño");
  assert.ok(marca.consultas.every((c) => c.marcas.length === 1 && c.marcas[0] === "A"));
});

test("los tipos de catálogo solo aportan filtros; ninguno requiere una estrategia por nombre", () => {
  const opts = structuredClone(opciones);
  for (const d of ["generos", "grupos", "categorias"]) {
    opts[d] = [...new Set([...opts[d].map((x) => x.valor), ...TIPOS_CATALOGO.flatMap((t) => t[d])])].map((x) => op(x));
  }
  for (const tipo of TIPOS_CATALOGO) {
    const plan = planificarConsultas([], { ...vacio(), generos: [...tipo.generos], grupos: [...tipo.grupos], categorias: [...tipo.categorias] }, opts);
    assert.equal(plan.parcial, false, tipo.id);
    assert.equal(plan.consultas.length, 1, tipo.id);
  }
});

test("los códigos oficiales distintos del nombre visible se resuelven sin ampliar filtros", () => {
  assert.equal(valorFiltroErp("marcas", "NEW BALANCE", opciones), "NEWBALANCE");
  assert.equal(valorFiltroErp("categorias", "BASQUET", opciones), "BASKETBALL");
  assert.equal(valorFiltroErp("categorias", "TRAIL RUNNING", opciones), "TRAIL RUNN");
  assert.equal(valorFiltroErp("generos", "NIÑOS", opciones), "NINOS");
  assert.throws(() => valorFiltroErp("categorias", "DESCONOCIDA", opciones), /válido/);
  const ambiguas = structuredClone(opciones); ambiguas.marcas.push(op("OTRA", "A"));
  assert.throws(() => valorFiltroErp("marcas", "A", ambiguas), /único/);
  const sinCodigo = structuredClone(opciones); sinCodigo.marcas.push(op("", "SIN CODIGO"));
  assert.throws(() => valorFiltroErp("marcas", "SIN CODIGO", sinCodigo), /válido/);
});

test("un universo con código vacío no se usa para excluir productos al dividir", () => {
  const opts = structuredClone(opciones); opts.marcas.push(op("", "SIN CODIGO"));
  const plan = planificarConsultas(conteos, vacio(), opts);
  for (const p of [...puntos, { marca: "", genero: "HOMBRE", grupo: "ROPA", categoria: "MODA" }]) {
    assert.equal(plan.consultas.filter((c) => cubre(c, p)).length, 1);
  }
});

test("opciones incompletas y respuestas ambiguas no generan consultas vacías", () => {
  assert.deepEqual(opcionesErp({ opciones }), opciones);
  for (const dato of [null, {}, { opciones: {} }, { opciones: { ...opciones, generos: [] } }]) assert.throws(() => opcionesErp(dato));
});

test("la clave canoniza listas, almacenes y marcas y distingue los filtros que cambian el stock", () => {
  const f = { ...vacio(), almacenes: ["T02", "T01"], grupos: ["ZAPATILLAS"], marcas: ["NEW BALANCE"] };
  const clave = claveConsultaErp(f);
  assert.equal(claveConsultaErp({ ...f, almacenes: ["t01", "T02", "T01"], marcas: ["NEWBALANCE", " new balance "] }), clave);
  for (const cambio of [{ almacenes: ["T01"] }, { fecha_minima_ingreso: "2026-10-01" }, { stock_minimo: 2 }, { categorias: ["MODA"] }, { generos: ["JUNIOR"] }]) assert.notEqual(claveConsultaErp({ ...f, ...cambio }), clave);
  assert.equal(claveConsultaErp({ ...f, tallas: ["9"], precio_min: 100, solo_unicos: true }), clave);
});

test("la prioridad no altera el índice ni los filtros de los resultados", () => {
  const consultas = [ { ...vacio(), marcas: ["A"] }, { ...vacio(), marcas: ["B"] } ];
  const antes = structuredClone(consultas);
  const orden = ordenEjecucionErp([{ marca: "B", genero: "HOMBRE", grupo: "ROPA", categoria: "MODA", n: 50 }], consultas);
  assert.deepEqual(orden, [1, 0]); assert.deepEqual(consultas, antes);
});
