-- Migracion: MARKETING - sincronizar un catalogo con el ERP.
-- Idempotente - seguro de re-ejecutar. Solo ASCII (copiar con: LC_ALL=en_US.UTF-8 pbcopy).
--
-- Una sincronizacion reutiliza la tabla de generaciones: consulta el ERP en segundo plano con los filtros
-- (posiblemente editados) del catalogo y deja el resultado aqui, para revisarlo antes de aplicarlo al borrador
-- de una version. No toca ninguna tabla existente ni las versiones ya publicadas.
--
--   modo             'nuevo' (generar un catalogo) | 'sincronizar'
--   base_catalogo_id catalogo que se sincroniza
--   base_version     version cuyo borrador se actualiza (NULL = el borrador inicial de un catalogo sin publicar)
--   resultado        JSON: datos frescos del ERP + informe de cambios
--   aplicada_at      cuando se aplico al borrador (una sincronizacion se aplica una sola vez)
--
-- Reversion:
--   ALTER TABLE mk_generaciones DROP COLUMN IF EXISTS aplicada_at, DROP COLUMN IF EXISTS resultado,
--     DROP COLUMN IF EXISTS base_version, DROP COLUMN IF EXISTS base_catalogo_id, DROP COLUMN IF EXISTS modo;

BEGIN;
ALTER TABLE mk_generaciones ADD COLUMN IF NOT EXISTS modo TEXT NOT NULL DEFAULT 'nuevo';
ALTER TABLE mk_generaciones ADD COLUMN IF NOT EXISTS base_catalogo_id TEXT REFERENCES mk_catalogos(id) ON DELETE CASCADE;
ALTER TABLE mk_generaciones ADD COLUMN IF NOT EXISTS base_version INTEGER;
ALTER TABLE mk_generaciones ADD COLUMN IF NOT EXISTS resultado TEXT;
ALTER TABLE mk_generaciones ADD COLUMN IF NOT EXISTS aplicada_at TEXT;
COMMIT;
