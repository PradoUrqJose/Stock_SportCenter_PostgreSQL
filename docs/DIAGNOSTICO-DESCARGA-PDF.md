# Descarga del PDF: recuperación de imágenes

Revisión del 30 de octubre de 2026.

## Hallazgo

La captura reporta un fallo al leer la portada `paginas-fijas/portada-accesorios-7b0cef3d.webp` en la página 1. El texto de error anterior agrupaba fallos de red y CORS bajo un mismo mensaje: la captura por sí sola no permite distinguirlos ni atribuir el problema al tamaño del catálogo.

La portada existe: durante la revisión devolvió HTTP 200, 267.472 bytes y `Access-Control-Allow-Origin` correcto para `https://catalogos.sportcenterpe.com`, `https://stock-sc.vercel.app` y `http://localhost:3000`. Por tanto, no se reprodujo el fallo histórico en esa URL. Cloudflare documenta que objetos previamente cacheados pueden conservar respuestas anteriores a cambios CORS: <https://developers.cloudflare.com/r2/buckets/cors/>. Es una posibilidad, no una causa confirmada en este caso.

El generador repetía tres veces la misma URL directa. Si esa lectura estaba bloqueada, no tenía una vía alternativa para obtener los bytes aunque el visor pudiera mostrar la imagen.

## Corrección

- Conserva la descarga directa del CDN. Ante fallo de red, CORS, espera agotada o respuesta recuperable, utiliza `/api/catalogo/imagen` desde el mismo sitio.
- El respaldo solo lee las rutas públicas de portadas, fondos JPEG y derivados de 1200 px del bucket configurado. No acepta destinos externos, redirecciones ni claves arbitrarias. No necesita credenciales del bucket.
- Conserva `v` para los productos, el significado de HTTP 404, la cancelación y el armado local del PDF.
- Limita las esperas y el tamaño del respaldo a 4 MB por imagen. El dominio público permite exclusivamente esta API de lectura; las demás API siguen bloqueadas.
- El mensaje al usuario conserva el detalle y deja de recomendar reducir páginas para cualquier fallo.

## Validación

- 42 pruebas automatizadas: recuperación de la portada tras `Failed to fetch`, lectura normal, 404, cancelación, espera agotada, claves inválidas, origen fijo y límite de tamaño.
- TypeScript, ESLint y compilación de producción con Next.js 16.2.9 / Turbopack correctos.
- La ruta de respaldo respondió 200 usando `Host: catalogos.localhost:3000`. Su SHA-256 coincide con la portada pública: `db0e36cfbef886eb609aac23fa94820b7187656ddfeb3d7e48112f7625e5324b`.
- Prueba real en Chrome con la versión publicada de Accesorios (actualmente 113 páginas), que usa la misma portada de la captura. Una página temporal local utilizó el generador real con todas las imágenes directas servidas desde otro origen sin CORS. El respaldo recuperó 116 recursos y el generador terminó con un PDF de 6,4 MB en 11 s; una segunda generación terminó en 3 s. El navegador mostró el resultado satisfactorio. La captura está en `/private/tmp/stock-sc-pdf-cors-validado.png`.
- La página y el servidor temporales de la prueba se retiraron. No se modificaron catálogos ni archivos del bucket y no se desplegó el cambio.
