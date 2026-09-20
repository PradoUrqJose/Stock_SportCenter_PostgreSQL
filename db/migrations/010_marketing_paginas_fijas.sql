-- Migración: MARKETING — biblioteca de páginas fijas (portadas, separadores, cierres).
-- Idempotente — seguro de re-ejecutar.
--
-- Páginas completas hechas por Marketing que se reutilizan en cualquier catálogo:
-- el editor las ofrece en «Agregar página» y, si tienen `auto_tipo`, la
-- generación las pone sola (al inicio o al final) en los catálogos de ese tipo.
-- La imagen vive en R2 (`<imagen>.webp` y una miniatura `<imagen>-min.webp`).
--
-- Reversión:
--   DROP TABLE IF EXISTS mk_paginas_fijas;

CREATE TABLE IF NOT EXISTS mk_paginas_fijas (
  id            TEXT PRIMARY KEY,
  nombre        TEXT NOT NULL,
  tipo          TEXT NOT NULL CHECK (tipo IN ('portada', 'separador', 'cierre', 'otra')),
  imagen        TEXT NOT NULL,                -- paginas-fijas/<nombre>-<hash>  (sin extensión)
  ancho         INTEGER NOT NULL,
  alto          INTEGER NOT NULL,
  -- Uso automático al generar: id de un tipo de catálogo ('hombre', 'mujer', 'ninos', 'futbol') o '*' para todos.
  auto_tipo     TEXT,
  auto_posicion TEXT CHECK (auto_posicion IN ('inicio', 'final')),
  orden         INTEGER NOT NULL DEFAULT 0,
  activa        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT now_text()
);
