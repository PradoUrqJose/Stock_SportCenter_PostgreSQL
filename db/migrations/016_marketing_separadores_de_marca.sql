-- Migracion: MARKETING - separadores de marca (una pagina fija por marca, p. ej. "ADIDAS").
-- Idempotente - seguro de re-ejecutar. Solo ASCII (copiar con: LC_ALL=en_US.UTF-8 pbcopy).
--
-- Un separador de marca es una pagina fija de tipo 'separador_marca' con la marca en la columna `marca`
-- (mayusculas, igual que en el ERP). Al separar el bloque de productos por marcas en el Preview del
-- asistente, cada marca lleva antes su separador. No cambia nada de lo que ya existe.
--
-- Reversion (borra tambien los separadores de marca que se hayan subido):
--   DELETE FROM mk_paginas_fijas WHERE tipo = 'separador_marca';
--   ALTER TABLE mk_paginas_fijas DROP CONSTRAINT IF EXISTS mk_paginas_fijas_tipo_check;
--   ALTER TABLE mk_paginas_fijas ADD CONSTRAINT mk_paginas_fijas_tipo_check CHECK (tipo IN ('portada', 'separador', 'cierre', 'otra'));
--   ALTER TABLE mk_paginas_fijas DROP COLUMN IF EXISTS marca;

BEGIN;
ALTER TABLE mk_paginas_fijas ADD COLUMN IF NOT EXISTS marca TEXT;
ALTER TABLE mk_paginas_fijas DROP CONSTRAINT IF EXISTS mk_paginas_fijas_tipo_check;
ALTER TABLE mk_paginas_fijas ADD CONSTRAINT mk_paginas_fijas_tipo_check
  CHECK (tipo IN ('portada', 'separador', 'separador_marca', 'cierre', 'otra'));
COMMIT;
