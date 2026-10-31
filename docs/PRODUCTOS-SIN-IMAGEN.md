# Productos sin imagen

Ruta: `/admin/marketing/imagenes/sin-imagen`, accesible desde Marketing y desde la galería de imágenes. Requiere los permisos de Marketing.

## Cobertura y criterio

La lista parte de una consulta directa de todos los productos con stock positivo del ERP, para todos los almacenes configurados en `ALMACENES`. No exige haber importado el producto en STOCK, tener una plantilla, precio válido ni aparecer en un catálogo.

Cada código universal ocupa una sola fila. Se reúnen sus marcas, modelos, categorías, colores y edades. La imagen es compartida por todas las edades y tallas. El alias `400497_07` se cruza con su archivo canónico `400497-07`.

«Sin imagen» significa que falta el PNG original no vacío del código en la raíz de R2. Se consulta el listado firmado completo de objetos (ListObjectsV2, con paginación y sin caché), sin descargar las fotos ni hacer miles de peticiones individuales. `mk_imagenes` es un índice que puede estar desactualizado: no prueba existencia ni ausencia. Los derivados y páginas fijas no cuentan. Si R2 falla o el listado está incompleto, la consulta falla en vez de presentar falsos pendientes. La pantalla y el Excel usan la misma comprobación. Las fotos externas del ERP no cuentan como imágenes preparadas; las fotos existentes en R2 sí cuentan aunque se hayan subido desde otro proyecto.

## Consulta y conservación del resultado

«Actualizar desde ERP» inicia una consulta en segundo plano. Usa el mismo transporte, opciones oficiales, planificador de lotes, concurrencia máxima de tres y plazo global que los catálogos. No hay estrategias por marca, categoría ni nombre de catálogo.

El resultado y su fecha quedan en `mk_revision_imagenes`. Solo existe una consulta activa a la vez gracias a un índice único parcial en PostgreSQL. Se puede cerrar la pantalla y volver; buscar, ordenar, paginar y filtrar no vuelven a consultar el ERP. Una consulta fallida conserva el último inventario completado. Una consulta interrumpida permite reintentar después de seis minutos.

La revisión de imágenes valida las cantidades por talla pero admite identificar códigos con fichas repetidas: no necesita deducir cuál ficha es correcta para saber si falta la imagen. En esos códigos el stock se muestra como «Por revisar», sin sumar cantidades ambiguas. La generación de catálogos conserva su validación estricta de duplicados.

Los archivos originales de R2 se vuelven a listar al cargar o refrescar la página. Tras una subida correcta, la pantalla se actualiza y retira ese código de pendientes. Subir una imagen reutiliza el proceso existente de normalización a PNG transparente de 1600×1600, centrado con margen mínimo de 8 %, y creación de derivados.

## Interfaz

- Búsqueda por código, marca, modelo o color.
- Filtros combinables de marca, género/edad y categoría.
- Orden por mayor stock, marca o código; 50 filas por página.
- Estadísticas compactas en una franja; fecha, almacenes y detalles dentro del botón Información.
- Tabla con marcas, etiquetas de edades y stock; vista alternativa de galería con acceso directo a la subida.
- Encabezado y pestañas en un layout persistente. Al cambiar entre guardadas y pendientes, solo carga el contenido; la preferencia tabla/galería se conserva.
- Exportación Excel `.xlsx` de todos los resultados filtrados. Incluye filtros de columna, cabecera congelada, códigos como texto, stock numérico e información de la consulta. Los valores que parecen fórmulas se guardan como texto.
- Subida por código o por lote. Los códigos del ERP con espacios, por ejemplo `FPF 02092`, se aceptan sin permitir carpetas ni recorridos de ruta.

## Instalación y comprobaciones

Aplicar `db/migrations/020_marketing_revision_imagenes.sql` en cada base de datos antes de desplegar el código. La migración es idempotente y solo crea la tabla y sus índices. Se aplicó en la base local durante el desarrollo.

Pruebas: 56 casos de `npm test`, ESLint de los archivos modificados, TypeScript y `npm run build` con Turbopack. La cobertura incluye marcas ausentes de STOCK, stock cero, edades compartidas, fichas duplicadas, alias, códigos con espacios y filtros combinados. El Excel se escribe y se vuelve a abrir con ExcelJS para comprobar filas, códigos con ceros iniciales, cantidades, textos similares a fórmulas, metadatos y archivos vacíos.

La primera consulta real leyó 3.392 filas en 17 lotes y 144 segundos. Produjo 3.333 códigos únicos con stock en los 13 almacenes configurados: 2.813 con imagen registrada y 520 pendientes. De los pendientes, 347 no figuraban en el espejo local de productos. Las cinco marcas reclamadas están incluidas: CIRCA (2 pendientes), OLYMPIKUS (2), SALOMON (4), KULTURE (11) y SQUEEZE (4). Diecinueve códigos tienen cantidades ambiguas por fichas repetidas y se muestran sin sumar ese stock. Todos los códigos pendientes cumplen las reglas de subida.

En Chrome se comprobaron la consulta en segundo plano, conteos, paginación, filtro de CIRCA, reinicio de página al filtrar, búsqueda sin resultados, limpieza de filtros y apertura de la subida vinculada al código. Se mantuvo una sola consulta persistida durante esos recorridos. El índice de exclusión de consultas se comprobó además en una transacción revertida. La extensión de automatización no permite seleccionar archivos locales sin habilitar acceso a sus URL; por ello no se ejecutó una subida real de prueba a R2. La pantalla reutiliza el flujo de subida existente.

En la revisión visual se verificaron el diálogo Información, las dos vistas y el cambio de pestañas con el encabezado visible durante la carga del contenido. La galería elegida seguía activa al volver a pendientes. El endpoint de exportación respondió HTTP 200 con el filtro CIRCA. La captura automática de la descarga del navegador agotó su espera; se validaron directamente los archivos reales de CIRCA (2 productos) y de toda la lista (520), abriéndolos de nuevo y comprobando sus filas y códigos. Esa validación no volvió a consultar el ERP.

Evidencias locales: `/private/tmp/stock-sc-ui-imagenes-pruebas.log`, `/private/tmp/stock-sc-ui-imagenes-build.log`, `/private/tmp/stock-sc-ui-imagenes-tabla.png`, `/private/tmp/stock-sc-ui-imagenes-galeria.png`, `/private/tmp/stock-sc-ui-pendientes-CIRCA.xlsx` y `/private/tmp/stock-sc-ui-pendientes-todos.xlsx`. El cambio requiere migración y despliegue en producción; solo se aplicó la migración local.

## Corrección del cruce con R2 (31 de octubre de 2026)

La comprobación inicial con `mk_imagenes` produjo falsos pendientes porque el índice omitía subidas realizadas desde otro proyecto. La auditoría de lectura encontró 4.109 originales en R2 frente a 3.573 registros: 536 originales fuera del índice. De los 520 pendientes anteriores, 220 ya tenían archivo; quedan 300 pendientes reales y 3.033 productos con imagen del inventario de 3.333. `JQ1862.png` responde HTTP 200 (970.382 bytes) y ya no aparece como pendiente. El listado completo necesitó cinco páginas y la auditoría tardó unos cinco segundos; no se volvió a consultar el ERP. No se modificaron archivos de R2 ni el índice de imágenes de la base de datos.

Se añadieron pruebas de paginación de más de mil objetos, tokens opacos, códigos con espacios, originales vacíos, carpetas y derivados, XML malformado, páginas repetidas y fallos de red. Ningún fallo de listado se convierte en una lista de supuestas ausencias. Evidencia: `/private/tmp/stock-sc-auditoria-imagenes-r2.json` y `/private/tmp/stock-sc-jq1862-corregido.png`.
