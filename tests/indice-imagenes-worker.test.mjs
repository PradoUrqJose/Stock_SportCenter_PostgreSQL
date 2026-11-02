import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker,{reconciliar,actualizarObjeto,originalDelEvento} from '../services/indice-imagenes/worker.mjs';
function entorno(){
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../services/indice-imagenes/schema.sql',import.meta.url),'utf8'));
  const DB={
    prepare(text){return {bind(...params){return {
      first:async()=>sql.prepare(text).get(...params)??null,
      run:async()=>sql.prepare(text).run(...params),
      all:async()=>({results:sql.prepare(text).all(...params)}),
    };},first:async()=>sql.prepare(text).get()??null};},
    async batch(stmts){sql.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.all());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}},
  };
  const objects=new Map();
  const IMAGES={head:async key=>objects.get(key)??null,list:async()=>({objects:[...objects.values()],truncated:false})};
  return {env:{DB,IMAGES,READ_TOKEN:'lector',WRITE_TOKEN:'escritor',ADMIN_TOKEN:'administrador'},objects,sql};
}
function object(key,etag='a',time='2026-10-30T12:00:00Z'){return {key,etag,size:100,uploaded:new Date(time)};}
const request=(path,token='lector',method='GET',body)=>new Request('https://indice.test'+path,{method,headers:{Authorization:`Bearer ${token}`},...(body?{body:JSON.stringify(body)}:{})});

test('el índice exige autenticación e inventario completo antes de responder',async()=>{
 const t=entorno();
 assert.equal((await worker.fetch(request('/v1/images','incorrecto'),t.env)).status,401);
 assert.equal((await worker.fetch(request('/v1/images'),t.env)).status,503);
 t.objects.set('JQ1862.png',object('JQ1862.png'));
 assert.equal((await worker.fetch(request('/admin/reconcile','lector','POST'),t.env)).status,401);
 assert.equal((await worker.fetch(request('/admin/reconcile','administrador','POST'),t.env)).status,200);
 const r=await worker.fetch(request('/v1/images'),t.env);assert.equal(r.status,200);
 const d=await r.json();assert.equal(d.total,1);assert.equal(d.items[0].etag,'a');
 t.sql.close();
});

test('paginación y búsqueda combinan códigos y candidatos de marca/modelo sin depender de la tabla antigua',async()=>{
 const t=entorno();for(const key of ['A.png','B.png','C.png','50_01.png'])t.objects.set(key,object(key));
 await reconciliar(t.env);
 const page=await(await worker.fetch(request('/v1/images?limit=2&offset=2'),t.env)).json();
 assert.deepEqual(page.items.map(i=>i.code),['B','C']);assert.equal(page.total,4);
 const q=await(await worker.fetch(request('/v1/images/search?q=B','lector','POST',{codes:['A']}),t.env)).json();
 assert.deepEqual(q.items.map(i=>i.code),['A','B']);
 const literal=await(await worker.fetch(request('/v1/images?q=50_'),t.env)).json();assert.equal(literal.total,1);
 const none=await(await worker.fetch(request('/v1/images/lookup','lector','POST',{codes:[]}),t.env)).json();assert.equal(none.total,0);
 t.sql.close();
});

test('avisos atrasados consultan R2 actual; un derivado viejo no se sirve como imagen vigente',async()=>{
 const t=entorno();t.objects.set('A.png',object('A.png','actual','2026-10-31T12:00:00Z'));
 t.objects.set('derivados/w600/A.webp',object('derivados/w600/A.webp','viejo'));
 await reconciliar(t.env);
 let d=await(await worker.fetch(request('/v1/images/all'),t.env)).json();assert.equal(d.items[0].thumbnail600,false);
 t.objects.set('derivados/w600/A.webp',object('derivados/w600/A.webp','nuevo','2026-10-31T12:01:00Z'));
 let ack=0,retry=0;
 const msg={body:{bucket:'stock-sc-catalogo',object:{key:'derivados/w600/A.webp'}},ack:()=>ack++,retry:()=>retry++};
 await worker.queue({messages:[msg,msg]},t.env);
 d=await(await worker.fetch(request('/v1/images/all'),t.env)).json();assert.equal(d.items[0].thumbnail600,true);assert.equal(d.total,1);assert.equal(ack,2);assert.equal(retry,0);
 t.objects.delete('A.png');
 await worker.queue({messages:[{...msg,body:{object:{key:'A.png'},action:'PutObject'}}]},t.env);
 d=await(await worker.fetch(request('/v1/images/all'),t.env)).json();assert.equal(d.total,0);
 assert.equal(originalDelEvento('plantillas/NIKE.png'),null);
 t.sql.close();
});

test('un fallo durante el inventario conserva el último resultado y no marca ausencias falsas',async()=>{
 const t=entorno();t.objects.set('A.png',object('A.png'));await reconciliar(t.env);
 t.env.IMAGES.list=async()=>({objects:[],truncated:true});
 await assert.rejects(reconciliar(t.env),/Cursor R2/);
 const d=await(await worker.fetch(request('/v1/images/all'),t.env)).json();assert.equal(d.total,1);assert.equal(d.stale,true);
 t.sql.close();
});

test('los eventos concurrentes con una reconstrucción no se borran por un listado anterior',async()=>{
 const t=entorno();const old=object('A.png');t.objects.set('A.png',old);await reconciliar(t.env);
 t.env.IMAGES.list=async()=>{
   await new Promise(r=>setTimeout(r,2));
   t.objects.set('B.png',object('B.png','b'));await actualizarObjeto(t.env,'B.png');
   return {objects:[old],truncated:false};
 };
 await reconciliar(t.env);
 const d=await(await worker.fetch(request('/v1/images/all'),t.env)).json();assert.deepEqual(d.items.map(i=>i.code),['A','B']);
 t.sql.close();
});

test('la siembra recorre varias páginas de R2 y publica todos los bloques juntos',async()=>{
 const t=entorno();const rows=Array.from({length:1201},(_,i)=>object(`COD${String(i).padStart(4,'0')}.png`));
 let calls=0;
 t.env.IMAGES.list=async({cursor})=>{
   calls++;assert.equal(cursor,calls===1?undefined:'segunda');
   return calls===1?{objects:rows.slice(0,1000),truncated:true,cursor:'segunda'}:{objects:rows.slice(1000),truncated:false};
 };
 await reconciliar(t.env);
 const d=await(await worker.fetch(request('/v1/images?limit=48&offset=1200'),t.env)).json();
 assert.equal(calls,2);assert.equal(d.total,1201);assert.equal(d.items[0].code,'COD1200');
 const longSearch=await worker.fetch(request('/v1/images?q='+ 'A'.repeat(60)),t.env);
 assert.equal(longSearch.status,200);
 t.sql.close();
});
