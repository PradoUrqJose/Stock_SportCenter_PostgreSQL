-- Migración: rate-limit persistido en Turso (v1)
-- Ver src/lib/rate-limit.ts. Idempotente — seguro de re-ejecutar.
--
-- Reemplaza el rate-limit en memoria de proceso (que no protege nada en
-- serverless, donde cada invocación puede caer en una instancia distinta)
-- por una tabla compartida por todas las instancias.

CREATE TABLE IF NOT EXISTS rate_limits (
  clave    TEXT PRIMARY KEY,
  intentos INTEGER NOT NULL DEFAULT 1,
  reset_at INTEGER NOT NULL
);
