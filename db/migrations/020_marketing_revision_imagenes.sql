-- Inventario de productos con stock leído directamente del ERP para revisar imágenes.
-- El último resultado correcto sigue disponible si una actualización falla.
CREATE TABLE IF NOT EXISTS mk_revision_imagenes (
  id TEXT PRIMARY KEY,
  estado TEXT NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso', 'listo', 'error')),
  almacenes TEXT NOT NULL,
  productos TEXT,
  mensaje TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  iniciado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  terminado_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mk_revision_imagenes_activa
  ON mk_revision_imagenes (estado) WHERE estado = 'en_curso';
CREATE INDEX IF NOT EXISTS idx_mk_revision_imagenes_fecha
  ON mk_revision_imagenes (iniciado_at DESC);
