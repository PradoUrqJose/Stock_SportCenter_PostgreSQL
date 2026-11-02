// Cliente del servicio independiente. Sólo servidor: los tokens nunca llegan al navegador.
export type ImagenIndiceR2 = {
  code: string; key: string; etag: string; size: number; lastModified: string;
  thumbnail600: boolean; thumbnail1200: boolean;
};
export type RespuestaIndiceR2 = {
  schema: 1; checkedAt: string; updatedAt: string; stale: boolean;
  total: number; items: ImagenIndiceR2[];
};
export function indiceImagenesConfigurado() { return Boolean(process.env.IMAGE_INDEX_URL); }
export function validarRespuestaIndice(value: unknown): RespuestaIndiceR2 {
  const d=value as RespuestaIndiceR2;
  if(!d||d.schema!==1||!Number.isFinite(Date.parse(d.checkedAt))||!Number.isFinite(Date.parse(d.updatedAt))||typeof d.stale!=='boolean'||!Number.isSafeInteger(d.total)||d.total<0||!Array.isArray(d.items)||d.items.length>50000)throw Error('Respuesta inválida del índice de imágenes');
  const vistos=new Set<string>();
  for(const i of d.items){
    if(!i||typeof i.code!=='string'||!/^[A-Z0-9][A-Z0-9 ._-]{0,79}$/.test(i.code)||i.code.includes('..')||i.key!==`${i.code}.png`||typeof i.etag!=='string'||!i.etag||i.etag.length>200||!Number.isSafeInteger(i.size)||i.size<1||!Number.isFinite(Date.parse(i.lastModified))||typeof i.thumbnail600!=='boolean'||typeof i.thumbnail1200!=='boolean'||vistos.has(i.code))throw Error('Imagen inválida o repetida en el índice');
    vistos.add(i.code);
  }
  if(d.items.length>d.total)throw Error('Conteo inválido del índice');
  return d;
}
async function pedir(path:string, codes?:string[]) {
  const base=process.env.IMAGE_INDEX_URL;
  const token=process.env.IMAGE_INDEX_READ_TOKEN;
  if(!base||!token)throw Error('Falta configurar el índice compartido de imágenes');
  const url=new URL(path,base.replace(/\/+$/,'')+'/');
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw Error('El índice requiere HTTPS');
  const r=await fetch(url,{method:codes?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(codes?{'Content-Type':'application/json'}:{})},...(codes?{body:JSON.stringify({codes})}:{}),cache:'no-store',signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw Error(`Índice de imágenes no disponible (${r.status})`);
  return validarRespuestaIndice(await r.json());
}
export async function leerIndiceImagenes(codes?:string[]) {
  const d=await pedir(codes?'v1/images/lookup':'v1/images/all',codes);
  if(d.items.length!==d.total)throw Error('Inventario de imágenes incompleto');
  if(d.stale)throw Error('El índice de imágenes necesita una nueva comprobación de R2; no se puede confirmar qué productos no tienen imagen');
  return d;
}
export function paginaIndiceImagenes(limit:number,offset:number,codes?:string[],q="") {
  return pedir(`v1/images${codes?'/search':''}?limit=${limit}&offset=${offset}&q=${encodeURIComponent(q)}`,codes);
}
export async function refrescarIndiceImagenes(code:string) {
  if(!indiceImagenesConfigurado())return;
  const base=process.env.IMAGE_INDEX_URL,token=process.env.IMAGE_INDEX_WRITE_TOKEN;
  if(!base||!token)throw Error('Falta configurar la actualización del índice');
  const url=new URL('v1/refresh',base.replace(/\/+$/,'')+'/');
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw Error('El índice requiere HTTPS');
  const r=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({keys:[`${code}.png`]}),cache:'no-store',signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw Error(`No se pudo actualizar el índice (${r.status})`);
}
