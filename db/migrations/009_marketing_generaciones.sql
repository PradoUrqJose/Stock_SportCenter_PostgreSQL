-- Migración: MARKETING — generación de catálogos en segundo plano + historial.
-- Idempotente — seguro de re-ejecutar.
--
-- Una fila por cada vez que se pide generar un catálogo: mientras corre guarda
-- la etapa (para la barra de avance) y al terminar deja el catálogo creado o el
-- error. Sirve también de historial (quién, cuándo, con qué filtros).
--
-- Reversión:
--   DROP TABLE IF EXISTS mk_generaciones;

CREATE TABLE IF NOT EXISTS mk_generaciones (
  id           TEXT PRIMARY KEY,
  titulo       TEXT NOT NULL,
  filtros      TEXT NOT NULL,                 -- JSON de los filtros pedidos
  estado       TEXT NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso', 'listo', 'error')),
  etapa        TEXT NOT NULL DEFAULT 'erp',   -- erp | armando | guardando
  mensaje      TEXT,                          -- resultado o motivo del error
  catalogo_id  TEXT REFERENCES mk_catalogos(id) ON DELETE SET NULL,
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT now_text(),
  finished_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_mk_generaciones_created ON mk_generaciones (created_at DESC);
