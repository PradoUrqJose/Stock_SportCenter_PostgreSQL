-- Migración: índice para el ORDER BY marca, modelo del editor de actualización.
-- Idempotente — seguro de re-ejecutar.

CREATE INDEX IF NOT EXISTS idx_productos_marca_modelo ON productos(marca, modelo);
