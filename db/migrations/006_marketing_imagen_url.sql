-- Migración: MARKETING — el enlace público de cada imagen se guarda en Neon.
-- Idempotente — seguro de re-ejecutar.
--
-- imagen_url = enlace público del PNG original en R2 (sin parámetros). Se
-- rellena solo al subir/reemplazar una imagen desde el módulo, DESPUÉS de que
-- el archivo ya está en R2. Los 3573 códigos sembrados en la 005 se rellenan
-- aquí con la URL pública actual del bucket (r2.dev); si el bucket pasa a un
-- dominio propio, basta un UPDATE con REPLACE sobre esta columna.
--
-- Reversión: ALTER TABLE mk_imagenes DROP COLUMN IF EXISTS imagen_url;

ALTER TABLE mk_imagenes ADD COLUMN IF NOT EXISTS imagen_url TEXT;

UPDATE mk_imagenes
   SET imagen_url = 'https://pub-d552bc6cdf204353a02e1f8afd4c87ed.r2.dev/' || cod_universal || '.png'
 WHERE imagen_url IS NULL;
