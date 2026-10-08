-- Una transacción visible por código, con estado independiente para IZQ y DER.
ALTER TABLE traslados DROP CONSTRAINT IF EXISTS traslados_estado_check;
ALTER TABLE traslados ADD CONSTRAINT traslados_estado_check
  CHECK (estado IN ('solicitado', 'parcial', 'enviado', 'recibido'));

CREATE TABLE IF NOT EXISTS traslado_partes (
  traslado_id BIGINT NOT NULL REFERENCES traslados(id) ON DELETE RESTRICT,
  cod_barras TEXT NOT NULL,
  lado TEXT NOT NULL CHECK (lado IN ('izq', 'der')),
  origen TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('solicitado', 'enviado', 'recibido')),
  actualizado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (traslado_id, lado)
);
CREATE INDEX IF NOT EXISTS idx_traslado_partes_origen ON traslado_partes(origen, estado, traslado_id);

-- Conserva cualquier movimiento creado antes de esta refactorización.
INSERT INTO traslado_partes (traslado_id, cod_barras, lado, origen, estado)
SELECT id, cod_barras, 'izq', origen, estado FROM traslados WHERE lado IN ('izq', 'ambos')
ON CONFLICT DO NOTHING;
INSERT INTO traslado_partes (traslado_id, cod_barras, lado, origen, estado)
SELECT id, cod_barras, 'der', origen, estado FROM traslados WHERE lado IN ('der', 'ambos')
ON CONFLICT DO NOTHING;

ALTER TABLE traslado_eventos ADD COLUMN IF NOT EXISTS lado TEXT
  CHECK (lado IS NULL OR lado IN ('izq', 'der'));
