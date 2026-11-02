# Catálogos sin precios y precarga de imágenes

En el último paso del asistente, antes de generar, «Precios del catálogo» permite elegir **Con precios** o **Sin precios**. Sin precios aplica una misma plantilla GENERAL a todas las marcas, aunque tengan diseños propios. Se puede elegir una genérica activa existente o subirla desde «Subir general». La selección de plantillas por marca se conserva al volver a Con precios.

La general debe estar registrada con marca `*` y activa. No se elige automáticamente una plantilla de otra marca si la seleccionada desaparece. El servidor valida este requisito antes de iniciar la generación; si falta, se pide elegir o subir una. En la base local revisada el 2 de noviembre de 2026 no había una general registrada. La función no crea un diseño por su cuenta.

El precio de cada producto se guarda como `null` en este modo. El editor, el visor y el PDF omiten su texto; el snapshot público también elimina cualquier importe si `sin_precios` está activo. Un precio o rótulo incrustado dentro de la imagen del fondo sigue siendo parte del diseño: para evitarlo hay que subir un fondo sin ese elemento. Código, tallas y stock conservan su funcionamiento.

Los filtros de rango de precio, si se eligieron, siguen seleccionando productos por su precio real del ERP. Sin un rango y en modo sin precios, un producto con tallas con stock puede entrar aunque el ERP no tenga precio. Con precios se conserva la regla anterior de exigir un precio válido positivo.

Los filtros JSON del catálogo guardan `sin_precios` y `plantilla_general`. Borradores y snapshots guardan el modo sin precios para conservarlo entre ediciones y sincronizaciones. Al sincronizar en ese modo se mantiene la general, incluidos los productos quitados que se restauren después. Al volver a Con precios y sincronizar se recuperan importes y plantillas de marca del resultado fresco. El orden y los ajustes manuales se conservan. No hay migración de esquema ni cambios en catálogos existentes por defecto.

La biblioteca muestra la miniatura ya cargada al abrir el modal mientras llega el original; precarga y decodifica el PNG al detectar intención de apertura. Conserva como máximo cuatro imágenes anticipadas. El visor prepara aproximadamente cinco páginas horizontales por delante y detrás, decodifica las imágenes al montarlas y conserva la virtualización. No descarga las miles de imágenes al abrir el catálogo. Un salto a páginas lejanas o una red lenta todavía puede necesitar descarga.

Validación: TypeScript, ESLint, compilación con Turbopack y pruebas de generación, normalización de filtros, preview, snapshot sin importes y sincronización en ambos sentidos. Las comprobaciones visuales de apertura del modal, scroll y selección/subida de la general quedan a cargo del usuario. No se subieron imágenes de prueba ni se consultó el ERP para validar esta función.
