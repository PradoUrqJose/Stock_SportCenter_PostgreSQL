# Productos sin imagen

Ruta: `/admin/marketing/imagenes/sin-imagen`, accesible desde Marketing y desde la galería de imágenes. Requiere los permisos de Marketing.

## Cobertura y criterio

La lista parte de una consulta directa de todos los productos con stock positivo del ERP, para todos los almacenes configurados en `ALMACENES`. No exige haber importado el producto en STOCK, tener una plantilla, precio válido ni aparecer en un catálogo.

Cada código universal ocupa una sola fila. Se reúnen sus marcas, modelos, categorías, colores y edades. La imagen es compartida por todas las edades y tallas. El alias `400497_07` se cruza con su archivo canónico `400497-07`.

«Sin imagen» significa que el código no tiene una imagen con versión positiva registrada en `mk_imagenes`, el mismo registro usado para generar los catálogos. Las fotos externas del ERP no cuentan como imágenes preparadas. Esta pantalla no comprueba físicamente cada archivo de R2 ni diagnostica archivos rotos.

## Consulta y conservación del resultado

«Actualizar desde ERP» inicia una consulta en segundo plano. Usa el mismo transporte, opciones oficiales, planificador de lotes, concurrencia máxima de tres y plazo global que los catálogos. No hay estrategias por marca, categoría ni nombre de catálogo.

El resultado y su fecha quedan en `mk_revision_imagenes`. Solo existe una consulta activa a la vez gracias a un índice único parcial en PostgreSQL. Se puede cerrar la pantalla y volver; buscar, ordenar, paginar y filtrar no vuelven a consultar el ERP. Una consulta fallida conserva el último inventario completado. Una consulta interrumpida permite reintentar después de seis minutos.

La revisión de imágenes valida las cantidades por talla pero admite identificar códigos con fichas repetidas: no necesita deducir cuál ficha es correcta para saber si falta la imagen. En esos códigos el stock se muestra como «Por revisar», sin sumar cantidades ambiguas. La generación de catálogos conserva su validación estricta de duplicados.

Las imágenes registradas se vuelven a leer al cargar o refrescar la página. Tras una subida correcta, la pantalla se actualiza y retira ese código de pendientes. Subir una imagen reutiliza el proceso existente de normalización a PNG transparente de 1600×1600, centrado con margen mínimo de 8 %, y creación de derivados.

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
