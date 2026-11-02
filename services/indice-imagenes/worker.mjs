// Servicio independiente: sólo lee R2 y escribe su índice D1. No usa ERP, VPS ni Neon.
const RE_CODE = /^[A-Z0-9][A-Z0-9 ._-]{0,79}$/;
export function codigoOriginal(key) {
  if (typeof key !== 'string' || !key.endsWith('.png') || key.includes('/')) return null;
  const code = key.slice(0, -4);
  return RE_CODE.test(code) && !code.includes('..') && code !== '400497_07' ? code : null;
}
export function originalDelEvento(key) {
  if (codigoOriginal(key)) return key;
  const m = /^derivados\/w(?:600|1200)\/(.+)\.webp$/.exec(key ?? '');
  return m && codigoOriginal(`${m[1]}.png`) ? `${m[1]}.png` : null;
}
const json = (body, status = 200) => Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
const normalETag = value => String(value ?? '').replace(/^"|"$/g, '');
const fresco = (derivado, original) => Boolean(derivado?.size > 0 && +new Date(derivado.uploaded) >= +new Date(original.uploaded));
function datos(original, d600, d1200) {
  return {code:codigoOriginal(original.key), key:original.key, etag:normalETag(original.etag), size:original.size,
    modified:new Date(original.uploaded).toISOString(), thumb600:Number(fresco(d600,original)), thumb1200:Number(fresco(d1200,original))};
}
const upsert = `INSERT INTO images(code,key,etag,size,modified,present,thumb600,thumb1200,checked_at)
 VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET key=excluded.key,etag=excluded.etag,size=excluded.size,
 modified=excluded.modified,present=excluded.present,thumb600=excluded.thumb600,thumb1200=excluded.thumb1200,checked_at=excluded.checked_at
 WHERE images.checked_at <= excluded.checked_at`;

export async function actualizarObjeto(env, key) {
  const code = codigoOriginal(key);
  if (!code) return;
  // El aviso puede estar duplicado o llegar fuera de orden: se lee el estado actual.
  const checked = Date.now();
  const [o,a,b] = await Promise.all([env.IMAGES.head(key),env.IMAGES.head(`derivados/w600/${code}.webp`),env.IMAGES.head(`derivados/w1200/${code}.webp`)]);
  const d = o?.size > 0 ? datos(o,a,b) : {code,key,etag:'',size:0,modified:null,thumb600:0,thumb1200:0};
  await env.DB.batch([
    env.DB.prepare(upsert).bind(d.code,d.key,d.etag,d.size,d.modified,Number(o?.size>0),d.thumb600,d.thumb1200,checked),
    env.DB.prepare('UPDATE state SET updated_at=? WHERE id=1').bind(new Date().toISOString()),
  ]);
}

export async function reconciliar(env) {
  const start = Date.now(), scan = crypto.randomUUID();
  const acquired = await env.DB.prepare('UPDATE state SET scan_id=?,lock_until=? WHERE id=1 AND lock_until < ? RETURNING id').bind(scan,start+300000,start).first();
  if (!acquired) return {busy:true};
  try {
    const objetos = new Map(); let cursor;
    do {
      const p = await env.IMAGES.list({limit:1000,...(cursor?{cursor}:{})});
      if (!p || !Array.isArray(p.objects) || typeof p.truncated !== 'boolean') throw Error('Listado R2 incompleto');
      for (const o of p.objects) objetos.set(o.key,o);
      if (p.truncated && (!p.cursor || p.cursor===cursor)) throw Error('Cursor R2 incompleto');
      cursor = p.truncated ? p.cursor : undefined;
    } while(cursor);
    const rows = [...objetos.values()].filter(o=>codigoOriginal(o.key)&&o.size>0).map(o=>{
      const code=codigoOriginal(o.key);
      return datos(o,objetos.get(`derivados/w600/${code}.webp`),objetos.get(`derivados/w1200/${code}.webp`));
    });
    // Preparación aislada: las lecturas nunca ven un inventario publicado a medias.
    for(let n=0;n<rows.length;n+=500){
      await env.DB.prepare(`INSERT INTO scan_images(scan_id,code,key,etag,size,modified,thumb600,thumb1200)
        SELECT ?,json_extract(value,'$.code'),json_extract(value,'$.key'),json_extract(value,'$.etag'),
          json_extract(value,'$.size'),json_extract(value,'$.modified'),json_extract(value,'$.thumb600'),json_extract(value,'$.thumb1200')
        FROM json_each(?)`).bind(scan,JSON.stringify(rows.slice(n,n+500))).run();
    }
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO images(code,key,etag,size,modified,present,thumb600,thumb1200,checked_at)
        SELECT code,key,etag,size,modified,1,thumb600,thumb1200,? FROM scan_images WHERE scan_id=?
        ON CONFLICT(code) DO UPDATE SET key=excluded.key,etag=excluded.etag,size=excluded.size,modified=excluded.modified,
          present=1,thumb600=excluded.thumb600,thumb1200=excluded.thumb1200,checked_at=excluded.checked_at
        WHERE images.checked_at <= excluded.checked_at`).bind(start,scan),
      env.DB.prepare('UPDATE images SET present=0,checked_at=? WHERE checked_at<=? AND code NOT IN (SELECT code FROM scan_images WHERE scan_id=?)').bind(start,start,scan),
      env.DB.prepare('UPDATE state SET ready=1,last_scan=?,updated_at=?,last_error=NULL WHERE id=1 AND scan_id=?').bind(now,now,scan),
    ]);
    return {images:rows.length,checkedAt:now};
  } catch(e) {
    await env.DB.prepare('UPDATE state SET last_error=? WHERE id=1').bind(String(e.message).slice(0,200)).run();
    throw e;
  } finally {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM scan_images WHERE scan_id=?').bind(scan),
      env.DB.prepare('UPDATE state SET lock_until=0,scan_id=NULL WHERE id=1 AND scan_id=?').bind(scan),
    ]);
  }
}
async function autorizado(request, secret) {
  if (!secret) return false;
  const provided=request.headers.get('Authorization')??'';
  const [a,b]=await Promise.all([provided,`Bearer ${secret}`].map(x=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(x))));
  let diff=0; const aa=new Uint8Array(a),bb=new Uint8Array(b);
  for(let i=0;i<aa.length;i++)diff |= aa[i]^bb[i];
  return diff===0;
}
function item(r){return {code:r.code,key:r.key,etag:r.etag,size:r.size,lastModified:r.modified,thumbnail600:Boolean(r.thumb600),thumbnail1200:Boolean(r.thumb1200)};}
async function body(request) {
  const txt=await request.text(); if(txt.length>2_000_000)throw Error('Petición demasiado grande');
  return JSON.parse(txt);
}
const worker = {
  async fetch(request, env) {
    try {
      const url=new URL(request.url);
      if(url.pathname==='/admin/reconcile' && request.method==='POST'){
        if(!await autorizado(request,env.ADMIN_TOKEN))return json({error:'No autorizado'},401);
        return json(await reconciliar(env));
      }
      if(url.pathname==='/v1/refresh' && request.method==='POST'){
        if(!await autorizado(request,env.WRITE_TOKEN))return json({error:'No autorizado'},401);
        const {keys}=await body(request);
        if(!Array.isArray(keys)||keys.length>100||keys.some(k=>!codigoOriginal(k)))return json({error:'Claves inválidas'},400);
        for(const key of new Set(keys))await actualizarObjeto(env,key);
        return json({ok:true});
      }
      if(!await autorizado(request,env.READ_TOKEN))return json({error:'No autorizado'},401);
      if(!['/v1/images','/v1/images/all','/v1/images/search','/v1/images/lookup'].includes(url.pathname))return json({error:'No encontrado'},404);
      const st=await env.DB.prepare('SELECT ready,last_scan,updated_at,last_error FROM state WHERE id=1').first();
      if(!st?.ready)return json({error:'El índice aún no tiene una comprobación completa de R2'},503);
      const all=url.pathname.endsWith('/all')||url.pathname.endsWith('/lookup');
      const limit=all?50000:Number(url.searchParams.get('limit')??48), offset=all?0:Number(url.searchParams.get('offset')??0);
      if(!Number.isInteger(limit)||limit<1||limit>(all?50000:200)||!Number.isInteger(offset)||offset<0)return json({error:'Paginación inválida'},400);
      const q=(url.searchParams.get('q')??'').trim().toUpperCase().slice(0,80);
      let codes=null;
      if(request.method==='POST'){
        const b=await body(request); codes=b.codes??null;
        if(codes!==null&&(!Array.isArray(codes)||codes.length>50000||codes.some(c=>typeof c!=='string'||!RE_CODE.test(c)||c.includes('..'))))return json({error:'Códigos inválidos'},400);
      } else if(request.method!=='GET')return json({error:'Método no admitido'},405);
      // instr es literal y evita el límite de 50 bytes de LIKE de D1.
      const pattern=q;
      const like="instr(code, ?) > 0";
      const where='present=1 AND '+(codes===null?like:q?`(${like} OR code IN (SELECT value FROM json_each(?)))`:'code IN (SELECT value FROM json_each(?))');
      const args=codes===null?[pattern]:q?[pattern,JSON.stringify(codes)]:[JSON.stringify(codes)];
      const [count,rows]=await env.DB.batch([
        env.DB.prepare(`SELECT COUNT(*) AS total FROM images WHERE ${where}`).bind(...args),
        env.DB.prepare(`SELECT code,key,etag,size,modified,thumb600,thumb1200 FROM images WHERE ${where} ORDER BY code LIMIT ? OFFSET ?`).bind(...args,limit,offset),
      ]);
      const total=count.results[0].total;
      if(all&&total>limit)return json({error:'Inventario supera el límite; usa paginación'},413);
      return json({schema:1,checkedAt:st.last_scan,updatedAt:st.updated_at,stale:Boolean(st.last_error)||Date.now()-Date.parse(st.last_scan)>43200000,total,items:rows.results.map(item)});
    }catch(e){console.error('Índice de imágenes:',e.message);return json({error:'No se pudo consultar o sincronizar el índice de imágenes'},503);}
  },
  async queue(batch,env){
    for(const msg of batch.messages){
      try {
        if(msg.body?.bucket && msg.body.bucket!=='stock-sc-catalogo'){msg.ack();continue;}
        const key=originalDelEvento(msg.body?.object?.key);
        if(key)await actualizarObjeto(env,key);
        msg.ack();
      }catch(e){console.error('Aviso R2 pendiente:',e.message);msg.retry();}
    }
  },
  async scheduled(_event,env,ctx){ctx.waitUntil(reconciliar(env));},
};
export default worker;
