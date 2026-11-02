# Índice compartido de imágenes

Servicio independiente en Cloudflare: R2 → notificaciones → Queue → Worker → D1.
El Worker sólo lee metadatos del bucket `stock-sc-catalogo`. No escribe imágenes, no descarga sus bytes y no se conecta a PostgreSQL, al ERP ni al VPS. No modifica `catalogo/erp.json` ni el sincronizador existente.

## Recursos y acceso

- Worker: `stock-sc-indice-imagenes`, URL `https://stock-sc-indice-imagenes.josepradourquiza.workers.dev`.
- D1: `stock-sc-indice-imagenes`; identificador en `wrangler.jsonc`.
- Cola: `stock-sc-imagenes-cambios`; errores agotados: `stock-sc-imagenes-errores`.
- Notificaciones de creación/borrado: sufijo `.png`; prefijo `derivados/` y sufijo `.webp`. El consumidor descarta archivos ajenos a originales/derivados de productos.
- Reconciliación completa cada seis horas y manual bajo autorización de administrador.

Tokens separados y secretos de Worker: `READ_TOKEN`, `WRITE_TOKEN`, `ADMIN_TOKEN`. No incluirlos en Git ni enviarlos al navegador. Las aplicaciones sólo reciben lectura y actualización verificada; nunca administración.

En los servidores de **ambos** proyectos configurar:

```dotenv
IMAGE_INDEX_URL=https://stock-sc-indice-imagenes.josepradourquiza.workers.dev
IMAGE_INDEX_READ_TOKEN=<READ_TOKEN>
IMAGE_INDEX_WRITE_TOKEN=<WRITE_TOKEN>
```

Reiniciar el servidor de desarrollo después de cambiar variables. En Vercel, configurarlas por entorno y desplegar el código de cada proyecto. Los cambios de `.env.local` no configuran Vercel.

## Lecturas y consistencia

STOCK obtiene 48 imágenes por página y consulta sus descripciones en PostgreSQL. Pendientes, Excel y catálogos consultan el índice completo; no recorren R2 ni leen todas las revisiones de `mk_imagenes`. Estandarización consulta todos los metadatos del índice en paralelo al JSON del ERP que ya utiliza: conserva sus filtros locales y su sincronizador.

Un PNG raíz no vacío prueba presencia. Los eventos vuelven a leer el estado actual de R2, de modo que duplicados, avisos atrasados y borrados no restauran metadatos antiguos. El ETag real sirve como revisión de caché; no se crean archivos versionados. Un WebP anterior al PNG no se considera vigente: se usa el PNG hasta regenerar ese derivado. Este servicio no genera derivados.

Después de una subida en cualquiera de las aplicaciones se solicita una actualización verificada inmediata. La cola también actualiza cambios externos. **La propagación de eventos es asíncrona, no instantánea**; la revisión completa recupera avisos perdidos. No sustituye la comprobación HEAD y los PUT condicionales del uploader de STOCK.

Antes de la primera siembra, la API devuelve 503. Una revisión incompleta no publica resultados parciales ni marca ausencias falsas. Un índice con error en su revisión o más de 12 horas sin revisión se señala como desactualizado: la biblioteca muestra una advertencia y las operaciones que clasifican pendientes fallan explícitamente. Si el servicio está configurado y falla, no se vuelve silenciosamente al listado lento. Sin `IMAGE_INDEX_URL`, queda disponible la ruta anterior para reversión.

## Operación y despliegue

1. Inventariar recursos y notificaciones existentes. Crear sólo D1 y colas nuevas; nunca reemplazar reglas ajenas ni contratar/cambiar planes automáticamente.
2. `npm install` en esta carpeta. Wrangler está fijado en `package.json`.
3. Inicializar sólo la D1 nueva: `npx wrangler d1 execute stock-sc-indice-imagenes --remote --file schema.sql`.
4. `npm run check`, `npm run deploy` y configurar los tres secretos con `wrangler secret bulk` desde un archivo privado fuera del repositorio.
5. Añadir las dos reglas de notificación a la cola del índice, conservando todas las anteriores.
6. Ejecutar `POST /admin/reconcile` con `Authorization: Bearer <ADMIN_TOKEN>`. Sembrar antes de activar las aplicaciones.
7. Comprobar conteos, JQ1862, HTTP 401 sin token y las rutas de consulta. Configurar las tres variables en cada aplicación y reiniciarla/desplegarla.

API de lectura autenticada: `GET /v1/images?limit=48&offset=0&q=...`, `GET /v1/images/all`, `POST /v1/images/lookup` y `POST /v1/images/search` con `{codes:[...]}`. La búsqueda reúne coincidencias literales de código y candidatos de marca/modelo aportados por STOCK. `POST /v1/refresh` usa el token de escritura y `{keys:["CODIGO.png"]}`; sólo admite originales y verifica su existencia real.

Ante errores revisar logs del Worker, cola de errores y `state.last_error`. Tras corregir el problema, ejecutar reconciliación manual. Un despliegue posterior del Worker conserva D1 y las colas. Revertir una aplicación retirando `IMAGE_INDEX_URL` vuelve al comportamiento anterior sin borrar recursos ni imágenes. No purgar colas ni eliminar reglas como parte de una reversión rutinaria.

## Validación inicial

El 2 de noviembre de 2026 UTC se sembraron 4.111 originales. JQ1862 está presente con tamaño 970.382 bytes y el ETag de R2. Las primeras tres páginas de 48 registros tardaron 443, 378 y 378 ms desde este Mac; el inventario completo, 867 ms. La siembra inicial tardó 15,8 s y ocurre fuera de la apertura de las pantallas. Sin token respondió 401. Esto mide la API, no el tiempo completo de la UI ni garantiza latencia idéntica en Vercel.

Pruebas de SQL real en SQLite y dobles de R2: paginación, autenticación, siembra de múltiples páginas, actualizaciones duplicadas, eliminación, WebP desactualizado, fallos de listado y eventos concurrentes. Pruebas del cliente: esquema, inventario incompleto, inventario desactualizado y rechazo explícito de errores de servicio. No escriben en R2 ni en el ERP. La comprobación visual y una subida real quedan a cargo del usuario.

Documentación primaria: [eventos de R2](https://developers.cloudflare.com/r2/buckets/event-notifications/), [D1](https://developers.cloudflare.com/d1/worker-api/d1-database/), [límites de D1](https://developers.cloudflare.com/d1/platform/limits/), [precios de Queues](https://developers.cloudflare.com/queues/platform/pricing/).
