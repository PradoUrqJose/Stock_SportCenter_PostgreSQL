import './helpers/resolver-typescript.mjs';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import sharp from 'sharp';
process.env.DATABASE_URL = 'postgres://test:test@localhost:1/test';
process.env.R2_ENDPOINT = 'https://r2.test.invalid';
process.env.R2_BUCKET = 'pruebas';
process.env.R2_ACCESS_KEY_ID = 'test';
process.env.R2_SECRET_ACCESS_KEY = 'test';
const { db } = await import('../src/lib/db.ts');
const { guardarImagen } = await import('../src/lib/marketing-subida.ts');
const { inventarioImagenesVigente } = await import('../src/lib/marketing-inventario-imagenes.ts');
const fetchOriginal = globalThis.fetch;
const ejecutarOriginal = db.execute;
after(() => { globalThis.fetch = fetchOriginal; db.execute = ejecutarOriginal; });
const png = await sharp({create:{width:1600,height:1600,channels:4,background:{r:50,g:100,b:200,alpha:0.5}}}).png().toBuffer();

function escenario({version = null, head = 200, put = 200, redCaida = false} = {}) {
  const puts = []; const escrituras = [];
  db.execute = async (stmt) => {
    if (stmt.sql.startsWith('SELECT version')) return {rows:version === null ? [] : [{version}]};
    escrituras.push(stmt);
    return {rows:[],rowsAffected:1};
  };
  globalThis.fetch = async (request) => {
    if (request.method === 'HEAD') {
      if (redCaida) throw Error('Sin conexión');
      return new Response(null, {status:head, headers:{etag:'"revision-actual"', 'content-length':'1000'}});
    }
    puts.push(request);
    return new Response(null, {status:put});
  };
  return {puts,escrituras};
}

test('una carga nueva no sobrescribe JQ1862 presente en R2 aunque falte su fila', async () => {
  const e = escenario();
  await assert.rejects(guardarImagen('JQ1862', png, 'nueva', 'usuario'), err => err.status === 409);
  assert.equal(e.puts.length, 0);
  assert.equal(e.escrituras.length, 0);
});

test('una fila antigua sin archivo permite recuperar el producto como nueva imagen', async () => {
  const e = escenario({version:7, head:404});
  const r = await guardarImagen('RECUPERADA', png, 'nueva', 'usuario');
  assert.equal(r.version, 8);
  assert.equal(e.puts[0].headers.get('If-None-Match'), '*');
  assert.equal(e.puts.length, 3);
  assert.equal(e.escrituras.length, 1);
  assert.equal(e.escrituras[0].args[1], 8);
});

test('reemplazar una carga externa usa la revisión real y normaliza el alias', async () => {
  const e = escenario();
  const r = await guardarImagen('400497_07', png, 'reemplazo', 'usuario');
  assert.equal(r.cod_universal, '400497-07');
  assert(e.puts[0].url.includes('/400497-07.png'));
  assert.equal(e.puts[0].headers.get('If-Match'), '"revision-actual"');
  assert.equal(e.escrituras.length, 1);
});

test('una colisión concurrente o un fallo de R2 no registra una subida exitosa', async () => {
  const e = escenario({head:404, put:412});
  await assert.rejects(guardarImagen('COLISION', png, 'nueva', 'usuario'), err => err.status === 409);
  assert.equal(e.puts.length, 1);
  assert.equal(e.escrituras.length, 0);
  const caido = escenario({redCaida:true});
  await assert.rejects(guardarImagen('ERROR', png, 'nueva', 'usuario'), /Sin conexión/);
  assert.equal(caido.puts.length, 0);
  assert.equal(caido.escrituras.length, 0);
});

test('un listado incompleto de R2 no escribe ni entrega una clasificación falsa', async () => {
  let escrituras = 0;
  db.execute = async () => { escrituras++; return {rows:[]}; };
  globalThis.fetch = async () => new Response('<ListBucketResult>', {status:200});
  await assert.rejects(inventarioImagenesVigente());
  assert.equal(escrituras, 0);
});
