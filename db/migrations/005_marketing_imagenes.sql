-- Migración: módulo MARKETING — fase 1 (IMAGENES).
-- Idempotente — seguro de re-ejecutar.
--
-- Solo lo necesario para listar/reemplazar imágenes. Las tablas de plantillas,
-- páginas fijas y catálogos llegan en migraciones propias cuando se construyan
-- esas fases (ver PruebaCatalogo/docs/04-plan-integracion-stock-sc.md).
--
-- Reversión:
--   DELETE FROM admin_modules WHERE module_id = 'marketing';
--   DELETE FROM modules WHERE id = 'marketing';
--   DROP TABLE IF EXISTS mk_imagenes;

-- Versión vigente de cada imagen de producto guardada en R2. `version` entra
-- en el nombre de los derivados WebP (`<COD>.v<N>.webp`) y en la URL del PNG
-- para invalidar caché al reemplazar. cod_universal va SIEMPRE en MAYÚSCULAS.
CREATE TABLE IF NOT EXISTS mk_imagenes (
  cod_universal TEXT PRIMARY KEY,
  version       INTEGER NOT NULL DEFAULT 1,
  updated_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at    TEXT NOT NULL DEFAULT now_text()
);

INSERT INTO modules (id, nombre, ruta, descripcion, orden) VALUES
  ('marketing', 'Marketing', '/admin/marketing', 'Imágenes y catálogos para clientes', 13)
ON CONFLICT (id) DO NOTHING;
