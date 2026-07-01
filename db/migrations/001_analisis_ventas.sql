-- Migración: Módulo de Análisis de Ventas (v1)
-- Ver PLAN-ANALISIS-VENTAS.md. Idempotente — seguro de re-ejecutar.
--
-- 1) Convierte `ventas` en tabla de hechos (una fila por unidad vendida, con
--    todos los atributos fotografiados al momento de la carga).
-- 2) Clave única por cod_barras → dedup automático con INSERT OR IGNORE.
-- 3) Registra el módulo "Análisis" en el sidebar.
--
-- NOTA: recrea la tabla `ventas`. Los datos previos eran inservibles
-- (cod_universal siempre NULL por el join roto) y se recargan desde cero.

DROP TABLE IF EXISTS ventas;

CREATE TABLE ventas (
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

CREATE INDEX IF NOT EXISTS idx_ventas_producto  ON ventas(cod_universal, genero);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha      ON ventas(fecha_venta);
CREATE INDEX IF NOT EXISTS idx_ventas_marca      ON ventas(marca);
CREATE INDEX IF NOT EXISTS idx_ventas_categoria  ON ventas(categoria);
CREATE INDEX IF NOT EXISTS idx_ventas_ingreso    ON ventas(ingreso_fecha);

-- Módulo "Análisis" (orden 10, tras Utilidades=9)
INSERT OR IGNORE INTO modules (id, nombre, ruta, descripcion, orden)
VALUES ('analisis', 'Análisis', '/admin/analisis', 'Rotación, stock muerto y tendencias de ventas', 10);
