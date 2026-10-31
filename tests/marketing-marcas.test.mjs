import assert from "node:assert/strict";
import { test } from "node:test";
import { combinarMarcasMarketing } from "../src/lib/marketing-marcas.ts";

test("las marcas registradas están disponibles aunque todavía no haya productos ni plantillas", () => {
  const marcas = combinarMarcasMarketing([]);
  for (const marca of ["CIRCA", "OLYMPIKUS", "SALOMON", "KULTURE", "SQUEEZE"]) assert.ok(marcas.includes(marca));
});

test("la lista reúne inventario y diseños, mantiene el orden y normaliza espacios y mayúsculas", () => {
  const marcas = combinarMarcasMarketing(["NIKE", "salomon", "SQUEEZE\u00a0"], ["MARCA NUEVA", "  CIRCA  ", "*", ""]);
  assert.deepEqual(marcas.slice(0, 4), ["NIKE", "SALOMON", "SQUEEZE", "MARCA NUEVA"]);
  for (const marca of ["CIRCA", "OLYMPIKUS", "SALOMON", "KULTURE", "SQUEEZE"]) assert.equal(marcas.filter((m) => m === marca).length, 1);
  assert.ok(!marcas.includes("*"));
});
