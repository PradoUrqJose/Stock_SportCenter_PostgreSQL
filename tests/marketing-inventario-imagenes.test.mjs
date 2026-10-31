import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconciliarIndiceImagenes, versionImagenDisponible } from '../src/lib/marketing-inventario-imagenes-control.ts';

const indice = () => {
  const datos = new Map([['VIGENTE', 7], ['FANTASMA', 4], ['CERO', 0]]);
  const escrituras = [];
  return {
    datos, escrituras,
    leer: async () => [...datos].map(([codigo, version]) => ({codigo, version})),
    registrar: async codigos => {
      escrituras.push(codigos);
      return codigos.map(codigo => {
        const version = Math.max(datos.get(codigo) ?? 0, 1);
        datos.set(codigo, version);
        return {codigo, version};
      });
    },
  };
};

test('descubre originales ajenos a STOCK, repara el índice y conserva las versiones existentes', async () => {
  const bd = indice();
  const r = await reconciliarIndiceImagenes(['JQ1862', 'VIGENTE', 'CERO', 'JQ1862'], bd);
  assert.deepEqual([...r.versiones], [['JQ1862', 1], ['VIGENTE', 7], ['CERO', 1]]);
  assert.deepEqual(bd.escrituras, [['JQ1862', 'CERO']]);
  assert.equal(bd.datos.get('FANTASMA'), 4); // La fila antigua se conserva, pero no prueba existencia.
  assert.equal(versionImagenDisponible('FANTASMA', r.versiones), 0);
  await reconciliarIndiceImagenes(['JQ1862', 'VIGENTE', 'CERO'], bd);
  assert.equal(bd.escrituras.length, 1); // Repetir la comprobación no reescribe ni incrementa versiones.
});

test('cada comprobación refleja altas, bajas y reapariciones externas sin caché de ausencias', async () => {
  const bd = indice();
  const antes = await reconciliarIndiceImagenes(['VIGENTE'], bd);
  const despues = await reconciliarIndiceImagenes(['NUEVA'], bd);
  const vuelve = await reconciliarIndiceImagenes(['VIGENTE', 'NUEVA'], bd);
  assert.equal(versionImagenDisponible('VIGENTE', antes.versiones), 7);
  assert.equal(versionImagenDisponible('VIGENTE', despues.versiones), 0);
  assert.equal(versionImagenDisponible('VIGENTE', vuelve.versiones), 7);
  assert.equal(versionImagenDisponible('NUEVA', vuelve.versiones), 1);
});

test('la reparación respeta una subida concurrente y el alias conocido de imagen', async () => {
  const r = await reconciliarIndiceImagenes(['400497-07'], {
    leer: async () => [],
    registrar: async () => [{codigo:'400497-07', version:9}],
  });
  assert.equal(versionImagenDisponible(' 400497_07 ', r.versiones), 9);
});

test('una reparación o lectura fallida nunca se devuelve como inventario correcto', async () => {
  await assert.rejects(reconciliarIndiceImagenes(['A'], { leer: async () => { throw Error('BD no disponible'); }, registrar: async () => [] }), /BD no disponible/);
  await assert.rejects(reconciliarIndiceImagenes(['A'], { leer: async () => [], registrar: async () => [] }), /No se pudo registrar/);
  const bd = indice();
  const vacio = await reconciliarIndiceImagenes([], bd);
  assert.equal(vacio.versiones.size, 0);
  assert.equal(bd.escrituras.length, 0);
  assert.equal(bd.datos.size, 3);
});
