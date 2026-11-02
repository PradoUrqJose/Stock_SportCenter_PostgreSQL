// Una caché pequeña para la intención de abrir una imagen; nunca descarga toda la biblioteca.
const anticipadas = new Map<string, HTMLImageElement>();

export function precargarImagen(url: string) {
  if (typeof Image === "undefined" || anticipadas.has(url)) return;
  const imagen = new Image();
  imagen.decoding = "async";
  imagen.fetchPriority = "low";
  imagen.src = url;
  anticipadas.set(url, imagen);
  while (anticipadas.size > 4) anticipadas.delete(anticipadas.keys().next().value!);
  imagen.decode().catch(() => anticipadas.delete(url));
}

/** También prepara para dibujar las imágenes de páginas próximas, antes de verlas. */
export function decodificarAlMontar(imagen: HTMLImageElement | null) {
  if (imagen) imagen.decode().catch(() => undefined);
}
