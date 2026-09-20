-- Migración: MARKETING — gestión de plantillas desde la pantalla.
-- Idempotente — seguro de re-ejecutar.
--
-- Una marca puede tener varias plantillas; una es la PREDETERMINADA (la que se usa si al
-- crear el catálogo no se elige otra). La plantilla GENÉRICA (sin marca) es la que tiene
-- marca = '*': se usa para las marcas que no tienen plantilla propia.
--
-- Reversión:
--   ALTER TABLE mk_plantillas DROP COLUMN IF EXISTS predeterminada;

ALTER TABLE mk_plantillas ADD COLUMN IF NOT EXISTS predeterminada INTEGER NOT NULL DEFAULT 0;

-- Los diseños entregados por Marketing son las predeterminadas de sus marcas.
UPDATE mk_plantillas SET predeterminada = 1
WHERE id IN ('adidas', 'nike', 'puma', 'reebok', 'skechers') AND predeterminada = 0;
