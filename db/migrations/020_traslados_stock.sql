ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'tienda'
  CHECK (tipo IN ('tienda', 'almacen'));
UPDATE tiendas SET tipo='almacen' WHERE nombre LIKE 'JAL%';

CREATE TABLE IF NOT EXISTS inventario_completo (
  cod_barras TEXT PRIMARY KEY,
  cod_universal TEXT NOT NULL,
  marca TEXT,
  modelo TEXT,
  talla TEXT,
  genero TEXT,
  grupo TEXT,
  categoria TEXT,
  color TEXT,
  alm_izq TEXT NOT NULL,
  alm_der TEXT NOT NULL,
  actualizado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE inventario_completo ADD COLUMN IF NOT EXISTS ocupado BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_inventario_izq ON inventario_completo(alm_izq);
CREATE INDEX IF NOT EXISTS idx_inventario_der ON inventario_completo(alm_der);
CREATE INDEX IF NOT EXISTS idx_inventario_producto ON inventario_completo(cod_universal);

CREATE TABLE IF NOT EXISTS inventario_cargas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  archivo TEXT NOT NULL,
  filas INTEGER NOT NULL,
  cargado_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  cargado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS traslados (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cod_barras TEXT NOT NULL,
  cod_universal TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  origen TEXT NOT NULL,
  destino TEXT NOT NULL,
  lado TEXT NOT NULL CHECK (lado IN ('izq','der','ambos')),
  tipo TEXT NOT NULL CHECK (tipo IN ('solicitud','envio')),
  estado TEXT NOT NULL CHECK (estado IN ('solicitado','enviado','recibido')),
  atendido BOOLEAN NOT NULL DEFAULT false,
  creado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_traslado_activo_barra ON traslados(cod_barras)
  WHERE estado <> 'recibido';
CREATE INDEX IF NOT EXISTS idx_traslados_origen ON traslados(origen, estado, creado_at DESC);
CREATE INDEX IF NOT EXISTS idx_traslados_destino ON traslados(destino, estado, creado_at DESC);

CREATE TABLE IF NOT EXISTS traslado_eventos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  traslado_id BIGINT NOT NULL REFERENCES traslados(id) ON DELETE RESTRICT,
  estado TEXT NOT NULL,
  sede TEXT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  usuario TEXT NOT NULL,
  credencial_id INTEGER REFERENCES vendedores(id) ON DELETE SET NULL,
  credencial TEXT,
  creado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_traslado_eventos_id ON traslado_eventos(traslado_id, creado_at);
