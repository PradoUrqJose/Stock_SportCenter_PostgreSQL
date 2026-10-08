# Imágenes vigentes en R2

La aplicación conserva una imagen transparente por código en la raíz y dos derivados:

```
CODIGO.png
derivados/w600/CODIGO.webp
derivados/w1200/CODIGO.webp
plantillas/...
paginas-fijas/...
og/...
```

Las subidas reemplazan esos tres archivos sin crear historial ni `.vN.webp`. La revisión numérica en PostgreSQL sigue aumentando y se usa como `?v=N`; no es un archivo adicional. Caché de cinco minutos con revalidación, sin `immutable`.

Visor, galería, asistente y PDF solicitan las rutas fijas. Los catálogos existentes muestran la foto vigente; ya no congelan versiones antiguas de imágenes en R2. Sus datos, diseños y registros de generación se conservan. El alias confirmado `400497_07` se resuelve como `400497-07`.

Orden de migración: respaldar → generar/publicar/verificar WebP fijos → desplegar esta versión → comprobar catálogo/PDF → eliminar historial y WebP versionados. Nunca borrar las rutas antiguas antes del despliegue. Evitar cargas concurrentes durante esa ventana. Si cambia un PNG entre preparación y publicación, regenerar su derivado; la auditoría de limpieza exige un inventario sin cambios.

No hay cambios de ERP ni SQL de PostgreSQL en esta migración. ImageNormalization/manual todavía necesitan el sincronizador futuro para regenerar estos WebP al reemplazar un PNG por fuera de esta aplicación.

Validación local: 18 pruebas, TypeScript y compilación Next.js. La migración R2 se registra fuera del repositorio en H:/ProyectoERP/sincronizacion/limpieza-r2-2026-10-08/, sin credenciales en los informes.
