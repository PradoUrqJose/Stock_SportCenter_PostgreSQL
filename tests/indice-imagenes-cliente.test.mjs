import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validarRespuestaIndice,leerIndiceImagenes,paginaIndiceImagenes,refrescarIndiceImagenes} from '../src/lib/indice-imagenes.ts';

const respuesta=()=>({schema:1,checkedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),stale:false,total:1,
 items:[{code:'JQ1862',key:'JQ1862.png',etag:'etag-actual',size:970382,lastModified:'2026-10-16T15:40:51Z',thumbnail600:false,thumbnail1200:false}]});

test('el cliente rechaza inventarios corruptos y códigos repetidos',()=>{
 assert.equal(validarRespuestaIndice(respuesta()).items[0].code,'JQ1862');
 for(const change of [d=>d.items.push(d.items[0]),d=>d.items[0].size=0,d=>d.items[0].key='carpeta/JQ1862.png',d=>d.total=0,d=>d.checkedAt='inválida']){
   const d=respuesta();change(d);assert.throws(()=>validarRespuestaIndice(d));
 }
});

test('consulta autenticada, paginación y errores conservan el significado de ausencia',async()=>{
 const originalFetch=globalThis.fetch;
 const keys=['IMAGE_INDEX_URL','IMAGE_INDEX_READ_TOKEN','IMAGE_INDEX_WRITE_TOKEN'];
 const saved=keys.map(k=>process.env[k]);
 Object.assign(process.env,{IMAGE_INDEX_URL:'https://indice.test/',IMAGE_INDEX_READ_TOKEN:'lectura',IMAGE_INDEX_WRITE_TOKEN:'escritura'});
 try{
   const calls=[];let d=respuesta();
   globalThis.fetch=async(url,options)=>{calls.push({url:new URL(url),options});return Response.json(d);};
   await paginaIndiceImagenes(48,96,['JQ1862'],'ADIDAS & NIKE');
   assert.equal(calls[0].url.pathname,'/v1/images/search');
   assert.equal(calls[0].url.searchParams.get('q'),'ADIDAS & NIKE');
   assert.equal(calls[0].options.headers.Authorization,'Bearer lectura');
   assert.deepEqual(JSON.parse(calls[0].options.body),{codes:['JQ1862']});
   await refrescarIndiceImagenes('JQ1862');
   assert.equal(calls[1].url.pathname,'/v1/refresh');
   assert.equal(calls[1].options.headers.Authorization,'Bearer escritura');
   d={...respuesta(),total:2};await assert.rejects(leerIndiceImagenes(),/incompleto/);
   d={...respuesta(),stale:true};await assert.rejects(leerIndiceImagenes(),/no se puede confirmar/);
   let attempts=0;globalThis.fetch=async()=>{attempts++;return new Response('',{status:503});};
   await assert.rejects(leerIndiceImagenes(),/503/);assert.equal(attempts,1);
 }finally{
   globalThis.fetch=originalFetch;
   keys.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];});
 }
});
