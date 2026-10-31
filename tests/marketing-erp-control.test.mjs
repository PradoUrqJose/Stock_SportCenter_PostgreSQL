import assert from "node:assert/strict";
import { test } from "node:test";
import { ejecutarLotesErp, esperarPrecarga, respuestaErp, validarIntegridadErp } from "../src/lib/marketing-erp-control.ts";

test("dos fichas con el mismo código y género detienen la generación; géneros distintos se conservan", () => {
  const item = { cod_universal: "X", genero: "JUNIOR", stock_total: 1, tallas: { "9": 1 } };
  assert.doesNotThrow(() => validarIntegridadErp([item, { ...item, genero: "HOMBRE" }]));
  assert.throws(() => validarIntegridadErp([item, { ...item, cod_universal: " x " }]), /fichas repetidas/);
  assert.throws(() => validarIntegridadErp([item, { ...item, stock_total: 2, tallas: { "9": 2 } }]), /fichas repetidas/);
});

test("totales o cantidades inválidas nunca se convierten en stock ausente", () => {
  for (const item of [
    { cod_universal: "X", genero: "JUNIOR", stock_total: 2, tallas: { "9": 1 } },
    { cod_universal: "X", genero: "JUNIOR", stock_total: null, tallas: {} },
    { cod_universal: "X", genero: "JUNIOR", stock_total: 1, tallas: { "9": "error" } },
  ]) assert.throws(() => validarIntegridadErp([item]), /stock por talla/);
});

test("un plan de ejecución inválido se rechaza antes de consultar", async () => {
  const pedir = async () => { throw new Error("No debe consultar"); };
  await assert.rejects(ejecutarLotesErp([0, 0], pedir), /Plan de ejecución/);
  await assert.rejects(ejecutarLotesErp([1], pedir), /Plan de ejecución/);
  await assert.rejects(ejecutarLotesErp([0], pedir, { paralelo: 0 }), /Plan de ejecución/);
});

test("una respuesta vacía explícita es válida; datos ausentes, error o filas corruptas detienen la operación", () => {
  assert.deepEqual(respuestaErp({ items: [] }).items, []);
  for (const val of [null, {}, [], { items: null }, { error: "Sesión vencida" }, { items: [{}] }, { items: [{ cod_universal: "X", tallas: [] }] }]) assert.throws(() => respuestaErp(val));
});

test("el ejecutor limita a tres llamadas simultáneas y conserva el orden original", async () => {
  let activas = 0; let maximo = 0;
  const r = await ejecutarLotesErp([4, 2, 0, 1, 3], async (i) => { activas++; maximo = Math.max(maximo, activas); await Promise.resolve(); activas--; return `resultado ${i}`; });
  assert.equal(maximo, 3); assert.deepEqual(r, [0, 1, 2, 3, 4].map((i) => `resultado ${i}`));
});

test("un fallo aborta los otros lotes y no inicia los que quedan en cola", async () => {
  const iniciados = []; let cancelados = 0;
  await assert.rejects(ejecutarLotesErp([0, 1, 2, 3, 4], async (i, signal) => {
    iniciados.push(i);
    if (i === 0) throw new Error("fallo de prueba");
    return new Promise((resolve, reject) => signal.addEventListener("abort", () => { cancelados++; reject(signal.reason); }, { once: true }));
  }), /fallo de prueba/);
  assert.deepEqual(iniciados, [0, 1, 2]); assert.equal(cancelados, 2);
});

test("el plazo es del conjunto de lotes y aborta una consulta pendiente", async () => {
  let abortada = false;
  await assert.rejects(ejecutarLotesErp([0], async (_, signal) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => { abortada = true; reject(signal.reason); }, { once: true });
  }), { plazoMs: 15 }), /tiempo disponible/);
  assert.equal(abortada, true);
});

test("solo la ausencia inicial de una precarga permite consultar por primera vez", async () => {
  assert.equal(await esperarPrecarga(async () => null, JSON.parse), null);
  assert.deepEqual(await esperarPrecarga(async () => ({ estado: "listo", resultado: '{"items":[]}' }), JSON.parse), { items: [] });
  await assert.rejects(esperarPrecarga(async () => ({ estado: "error", resultado: null }), JSON.parse), /falló/);
  await assert.rejects(esperarPrecarga(async () => ({ estado: "error", resultado: null, mensaje: "El ERP tiene fichas repetidas: X" }), JSON.parse), /fichas repetidas: X/);
  await assert.rejects(esperarPrecarga(async () => ({ estado: "listo", resultado: null }), JSON.parse), /no guardó/);
});

test("vencer la espera o perder una precarga pendiente no dispara otra consulta", async () => {
  let ahora = 0;
  await assert.rejects(esperarPrecarga(async () => ({ estado: "en_curso", resultado: null }), JSON.parse, { ahora: () => ahora, dormir: async () => { ahora += 10; }, plazoMs: 20 }), /sigue pendiente/);
  let llamadas = 0;
  await assert.rejects(esperarPrecarga(async () => ++llamadas === 1 ? { estado: "en_curso", resultado: null } : null, JSON.parse, { dormir: async () => {} }), /dejó de estar/);
});
