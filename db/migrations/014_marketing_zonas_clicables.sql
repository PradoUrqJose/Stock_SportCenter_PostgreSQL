-- Migración: MARKETING — zonas clicables en las páginas fijas y enlaces de contacto.
-- Idempotente — seguro de re-ejecutar.
--
-- `mk_paginas_fijas.zonas` (JSON): rectángulos sobre la imagen, en fracciones de 0 a 1 de su ancho y alto, cada uno con el
-- tipo de enlace (whatsapp, instagram, tiktok, facebook o web). Los enlaces reales de contacto se guardan UNA vez en
-- `mk_enlaces`: cambiar el número de WhatsApp actualiza todas las portadas en la próxima publicación.
--
-- Reversión:
--   ALTER TABLE mk_paginas_fijas DROP COLUMN IF EXISTS zonas;   DROP TABLE IF EXISTS mk_enlaces;

ALTER TABLE mk_paginas_fijas ADD COLUMN IF NOT EXISTS zonas TEXT;

CREATE TABLE IF NOT EXISTS mk_enlaces (
  clave       TEXT PRIMARY KEY,               -- whatsapp | instagram | tiktok | facebook
  valor       TEXT NOT NULL,                  -- número, usuario o URL
  mensaje     TEXT,                           -- WhatsApp: mensaje con el que se abre el chat
  updated_at  TEXT NOT NULL DEFAULT now_text()
);

-- Datos que aparecen impresos en las portadas (se pueden cambiar desde Catálogos → Diseños).
INSERT INTO mk_enlaces (clave, valor, mensaje) VALUES
  ('whatsapp', '981320417', 'Hola, quiero consultar por el catálogo'),
  ('instagram', 'sportcenter.pe', NULL),
  ('tiktok', 'sportcenter.pe', NULL)
ON CONFLICT (clave) DO NOTHING;
