-- Migración: MARKETING — edición por versiones.
-- Idempotente — seguro de re-ejecutar.
--
-- Cada versión publicada puede tener su propia edición en curso: al abrir la
-- versión N en el editor, los cambios se guardan aquí (NULL = sin cambios, se
-- ve tal como se publicó) y al publicar salen como una versión nueva. El
-- snapshot de la versión N nunca se modifica.
--
-- Reversión:
--   ALTER TABLE mk_catalogo_versiones DROP COLUMN IF EXISTS borrador;

ALTER TABLE mk_catalogo_versiones ADD COLUMN IF NOT EXISTS borrador TEXT;
