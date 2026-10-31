import { SaxesParser } from "saxes";

/** ListObjectsV2 con encoding-type=url; un listado incompleto nunca prueba ausencia. */
export function paginaListadoR2(xml: string) {
  const parser = new SaxesParser();
  const pila: string[] = [];
  const claves: string[] = [];
  let texto = "";
  let raiz = "";
  let truncado = "";
  let siguiente = "";
  let encoding = "";
  let clave = "";
  let size = "";
  parser.on("opentag", (tag) => {
    pila.push(tag.name);
    if (pila.length === 1) raiz = tag.name;
    if (tag.name === "Contents") { clave = ""; size = ""; }
    texto = "";
  });
  parser.on("text", (valor) => { texto += valor; });
  parser.on("closetag", () => {
    const ruta = pila.join("/");
    if (ruta === "ListBucketResult/Contents/Key") clave = texto;
    if (ruta === "ListBucketResult/Contents/Size") size = texto;
    if (ruta === "ListBucketResult/Contents") {
      if (!clave || !/^\d+$/.test(size.trim())) throw new Error("R2 devolvió un objeto inválido");
      if (Number(size) > 0) claves.push(clave);
    }
    if (ruta === "ListBucketResult/IsTruncated") truncado = texto.trim();
    if (ruta === "ListBucketResult/NextContinuationToken") siguiente = texto;
    if (ruta === "ListBucketResult/EncodingType") encoding = texto.trim();
    pila.pop();
    texto = "";
  });
  parser.write(xml).close();
  if (raiz !== "ListBucketResult" || encoding !== "url" ||
      !["true", "false"].includes(truncado) || (truncado === "true" && !siguiente)) {
    throw new Error("R2 devolvió un listado incompleto o inválido; no se puede determinar qué imágenes faltan");
  }
  return { claves: claves.map((k) => decodeURIComponent(k)), siguiente: truncado === "true" ? siguiente : null };
}

export async function listarClavesR2(leer: (token: string | null) => Promise<string>) {
  const claves: string[] = [];
  const tokens = new Set<string>();
  let token: string | null = null;
  do {
    const pagina = paginaListadoR2(await leer(token));
    claves.push(...pagina.claves);
    token = pagina.siguiente;
    if (token && tokens.has(token)) throw new Error("R2 repitió una página del listado");
    if (token) tokens.add(token);
  } while (token);
  return claves;
}
