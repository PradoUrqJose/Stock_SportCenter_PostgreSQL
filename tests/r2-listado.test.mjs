import assert from "node:assert/strict";
import { test } from "node:test";
import { listarClavesR2, paginaListadoR2 } from "../src/lib/r2-listado.ts";
import { codigosImagenesR2, sinImagenRegistrada } from "../src/lib/marketing-imagenes-pendientes.ts";

const pagina = (claves, token = null) => `<?xml version="1.0"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><EncodingType>url</EncodingType><IsTruncated>${Boolean(token)}</IsTruncated>${claves.map(([k, size = 1]) => `<Contents><Key>${encodeURIComponent(k)}</Key><Size>${size}</Size></Contents>`).join("")}${token ? `<NextContinuationToken>${token}</NextContinuationToken>` : ""}</ListBucketResult>`;

test("JQ1862 en R2 queda fuera de pendientes aunque no tenga registro en la base", () => {
  const { claves } = paginaListadoR2(pagina([["JQ1862.png"], ["FPF 02092.png"]]));
  assert.deepEqual(sinImagenRegistrada([{ codigo: "JQ1862" }, { codigo: "FPF 02092" }, { codigo: "FALTANTE" }], codigosImagenesR2(claves)), [{ codigo: "FALTANTE" }]);
});

test("una fila en la base no prueba existencia y derivados o archivos vacíos no cuentan", () => {
  const { claves } = paginaListadoR2(pagina([["derivados/w600/A.webp"], ["paginas-fijas/A.png"], ["VACIO.png", 0], ["400497-07.png"]]));
  assert.deepEqual(codigosImagenesR2(claves), ["400497-07"]);
  assert.deepEqual(sinImagenRegistrada([{ codigo: "A" }, { codigo: "VACIO" }, { codigo: "400497-07" }], codigosImagenesR2(claves)), [{ codigo: "A" }, { codigo: "VACIO" }]);
});

test("recorre todas las páginas y conserva el token opaco con entidades XML", async () => {
  const recibidos = [];
  const claves = await listarClavesR2(async (token) => {
    recibidos.push(token);
    return token ? pagina([["JQ1862.png"]]) : pagina(Array.from({ length: 1000 }, (_, i) => [`A${i}.png`]), "a&amp;b+==");
  });
  assert.deepEqual(recibidos, [null, "a&b+=="]);
  assert.equal(claves.length, 1001);
  assert.equal(claves.at(-1), "JQ1862.png");
});

test("no clasifica como ausentes tras fallos de red ni páginas repetidas", async () => {
  await assert.rejects(listarClavesR2(async (token) => {
    if (token) throw new Error("Sin conexión");
    return pagina([["A.png"]], "siguiente");
  }), /Sin conexión/);
  await assert.rejects(listarClavesR2(async () => pagina([], "repetido")), /repitió/);
});

test("rechaza XML inválido, errores, paginación sin token y objetos sin tamaño", () => {
  for (const xml of ["<Error><Code>Denied</Code></Error>", "<ListBucketResult>", pagina([]).replace("false", "true"), pagina([["A.png"]]).replace("<Size>1</Size>", "")]) {
    assert.throws(() => paginaListadoR2(xml));
  }
  assert.deepEqual(paginaListadoR2(pagina([])), { claves: [], siguiente: null });
});
