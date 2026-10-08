import assert from "node:assert/strict";
import { test } from "node:test";
import { estadoGeneral, partesParaEnvio, partesParaSolicitud, siguienteEstado } from "../src/lib/traslados-reglas.ts";

test("un par dividido conserva un estado por lado y uno general", () => {
  assert.equal(estadoGeneral(["solicitado", "solicitado"]), "solicitado");
  assert.equal(estadoGeneral(["enviado", "solicitado"]), "parcial");
  assert.equal(estadoGeneral(["recibido", "enviado"]), "parcial");
  assert.equal(estadoGeneral(["recibido", "recibido"]), "recibido");
});

test("una solicitud conserva el origen independiente de IZQ y DER", () => {
  assert.deepEqual(partesParaSolicitud("JAL1", "JAL2", "T01"), [
    { lado: "izq", origen: "JAL1" }, { lado: "der", origen: "JAL2" },
  ]);
  assert.deepEqual(partesParaSolicitud("T01", "JAL2", "T01"), [{ lado: "der", origen: "JAL2" }]);
  assert.deepEqual(partesParaSolicitud("T01", "T01", "T01"), []);
});

test("un almacén solo envía el lado que tiene físicamente", () => {
  assert.deepEqual(partesParaEnvio("JAL1", "JAL2", "JAL1"), [{ lado: "izq", origen: "JAL1" }]);
  assert.deepEqual(partesParaEnvio("JAL1", "JAL1", "JAL1"), [
    { lado: "izq", origen: "JAL1" }, { lado: "der", origen: "JAL1" },
  ]);
});

test("solo origen entrega y solo destino recepciona, una vez por estado", () => {
  assert.equal(siguienteEstado("solicitado", "JAL1", "T02", "JAL1"), "enviado");
  assert.equal(siguienteEstado("solicitado", "JAL1", "T02", "T02"), null);
  assert.equal(siguienteEstado("enviado", "JAL1", "T02", "T02"), "recibido");
  assert.equal(siguienteEstado("enviado", "JAL1", "T02", "JAL1"), null);
  assert.equal(siguienteEstado("recibido", "JAL1", "T02", "T02"), null);
});
