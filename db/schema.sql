-- Schema base de Stock Sport Center.
-- Generado desde dev.db (source of truth hasta ahora). Idempotente.
-- Las migraciones incrementales en db/migrations/ se aplican DESPUÉS de este archivo.

CREATE TABLE IF NOT EXISTS tiendas (
  id                     TEXT PRIMARY KEY,
  nombre                 TEXT NOT NULL UNIQUE,
  excluida_actualizacion INTEGER NOT NULL DEFAULT 0,
  created_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  username   TEXT NOT NULL UNIQUE,
  email      TEXT UNIQUE,
  password   TEXT NOT NULL,
  nombre     TEXT NOT NULL,
  rol        TEXT NOT NULL CHECK (rol IN ('client', 'admin', 'administrador_general')),
  tienda_id  TEXT REFERENCES tiendas(id) ON DELETE SET NULL,
  activo     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS modules (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  ruta        TEXT NOT NULL,
  descripcion TEXT,
  orden       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS admin_modules (
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, module_id)
);

CREATE TABLE IF NOT EXISTS vendedores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre     TEXT NOT NULL,
  codigo     TEXT NOT NULL UNIQUE,
  tienda_id  TEXT NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  activo     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS producto_imagenes (
  cod_universal TEXT PRIMARY KEY,
  imagen_url    TEXT NOT NULL,
  source        TEXT NOT NULL CHECK (source IN ('archivo', 'sistema')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo         TEXT NOT NULL CHECK (tipo IN ('stock', 'ventas')),
  filas        INTEGER,
  ejecutado_at TEXT NOT NULL DEFAULT (datetime('now')),
  ejecutado_by TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS productos (
  cod_universal TEXT NOT NULL,
  genero        TEXT NOT NULL,
  marca         TEXT,
  modelo        TEXT,
  categoria     TEXT,
  grupo         TEXT,
  color         TEXT,
  precio_lista  REAL,
  descuento     REAL NOT NULL DEFAULT 0,
  stock_total   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (cod_universal, genero)
);

CREATE TABLE IF NOT EXISTS variantes (
  cod_barras    TEXT PRIMARY KEY,
  cod_universal TEXT NOT NULL,
  genero        TEXT NOT NULL,
  talla         TEXT,
  alm_izq       TEXT,
  alm_der       TEXT,
  cod_prod      TEXT,
  precio_compra REAL,
  ingreso_fecha TEXT,
  FOREIGN KEY (cod_universal, genero) REFERENCES productos(cod_universal, genero) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lotes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  estado       TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'publicado', 'cerrado')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  created_by   TEXT REFERENCES users(id),
  published_at TEXT,
  published_by TEXT REFERENCES users(id),
  closed_at    TEXT,
  closed_by    TEXT REFERENCES users(id),
  resanado_at  TEXT,
  resanado_by  TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS lote_lineas (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  lote_id            INTEGER NOT NULL REFERENCES lotes(id) ON DELETE CASCADE,
  cod_universal      TEXT NOT NULL,
  genero             TEXT NOT NULL,
  descuento_antes    REAL NOT NULL,
  descuento_nuevo    REAL NOT NULL,
  snap_marca         TEXT,
  snap_modelo        TEXT,
  snap_categoria     TEXT,
  snap_color         TEXT,
  snap_precio_lista  REAL,
  snap_precio_compra REAL,
  editado_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (lote_id, cod_universal, genero)
);

CREATE TABLE IF NOT EXISTS lote_exclusiones (
  lote_id     INTEGER NOT NULL REFERENCES lotes(id) ON DELETE CASCADE,
  tienda_id   TEXT    NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  excluida_at TEXT    NOT NULL DEFAULT (datetime('now')),
  excluida_by TEXT    REFERENCES users(id),
  PRIMARY KEY (lote_id, tienda_id)
);

CREATE TABLE IF NOT EXISTS confirmaciones (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  lote_id        INTEGER NOT NULL REFERENCES lotes(id) ON DELETE CASCADE,
  tienda_id      TEXT NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  cod_universal  TEXT NOT NULL,
  genero         TEXT NOT NULL,
  estado         TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmado', 'rechazado')),
  resuelto_at    TEXT,
  vendedor_id    INTEGER REFERENCES vendedores(id),
  codigo_usado   TEXT,
  motivo_rechazo TEXT,
  UNIQUE (lote_id, tienda_id, cod_universal, genero)
);

CREATE INDEX IF NOT EXISTS idx_variantes_producto  ON variantes(cod_universal, genero);
CREATE INDEX IF NOT EXISTS idx_variantes_alm_izq    ON variantes(alm_izq);
CREATE INDEX IF NOT EXISTS idx_variantes_alm_der    ON variantes(alm_der);
CREATE INDEX IF NOT EXISTS idx_lineas_lote          ON lote_lineas(lote_id);
CREATE INDEX IF NOT EXISTS idx_conf_lote            ON confirmaciones(lote_id);
CREATE INDEX IF NOT EXISTS idx_conf_tienda_estado   ON confirmaciones(tienda_id, estado);

-- ventas: convertida en tabla de hechos por db/migrations/001_analisis_ventas.sql.
-- Se crea aquí ya en su forma final para que un setup desde cero no dependa de
-- ejecutar esa migración únicamente por su efecto de esquema.
CREATE TABLE IF NOT EXISTS ventas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cod_barras    TEXT NOT NULL UNIQUE,   -- serial por unidad → clave de dedup
  cod_universal TEXT,
  genero        TEXT,
  fecha_venta   TEXT NOT NULL,          -- ISO YYYY-MM-DD
  ingreso_fecha TEXT,                   -- derivada del barcode (día = mes en formato antiguo)
  almacen       TEXT,                   -- IZQ/DER
  marca         TEXT,
  modelo        TEXT,
  categoria     TEXT,
  grupo         TEXT,
  color         TEXT,
  talla         TEXT,
  precio_compra REAL,
  precio_lista  REAL,
  importe       REAL,                   -- VENTA (0 en regalos)
  imported_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ventas_producto ON ventas(cod_universal, genero);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha     ON ventas(fecha_venta);
CREATE INDEX IF NOT EXISTS idx_ventas_marca     ON ventas(marca);
CREATE INDEX IF NOT EXISTS idx_ventas_categoria ON ventas(categoria);
CREATE INDEX IF NOT EXISTS idx_ventas_ingreso   ON ventas(ingreso_fecha);

-- rate-limit persistido (src/lib/rate-limit.ts). Se crea aquí en su forma final
-- (ver db/migrations/002_rate_limits.sql) para que un setup desde cero no
-- dependa de ejecutar esa migración únicamente por su efecto de esquema.
CREATE TABLE IF NOT EXISTS rate_limits (
  clave    TEXT PRIMARY KEY,
  intentos INTEGER NOT NULL DEFAULT 1,
  reset_at INTEGER NOT NULL
);

-- Módulos del sidebar admin (referenciados por admin_modules). Datos de configuración,
-- no datos de negocio: van seedeados junto con el schema.
INSERT OR IGNORE INTO modules (id, nombre, ruta, orden) VALUES
  ('dashboard',    'Dashboard',        '/admin',                        1),
  ('productos',    'Productos',        '/admin/productos',              2),
  ('actualizacion','Actualización',    '/admin/actualizacion',          3),
  ('registro',     'Registro Cambios', '/admin/actualizacion-updates',  4),
  ('tiendas',      'Tiendas',          '/admin/gestion/tiendas',        5),
  ('usuarios',     'Usuarios',         '/admin/gestion/usuarios',       6),
  ('credenciales', 'Credenciales',     '/admin/gestion/credenciales',   7),
  ('reposicion',   'Reposición',       '/admin/reposicion',             8),
  ('utils',        'Utilidades',       '/admin/utils',                  9),
  ('analisis',     'Análisis',         '/admin/analisis',              10);
