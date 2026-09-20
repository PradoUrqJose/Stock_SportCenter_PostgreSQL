-- Migración: MARKETING — catálogos web (plantillas, catálogos y versiones publicadas).
-- Idempotente — seguro de re-ejecutar.
--
-- Un catálogo = un enlace fijo (slug secreto). Cada publicación guarda UN JSON
-- inmutable (snapshot) en mk_catalogo_versiones y el enlace muestra siempre la
-- versión_publicada más reciente; las anteriores quedan de histórico. El visor
-- público solo lee ese JSON: nada de esto se consulta en cada visita cuando el
-- snapshot está en caché.
--
-- Reversión:
--   DROP TABLE IF EXISTS mk_catalogo_versiones, mk_catalogos, mk_plantillas;

-- Diseño plano por marca (imagen de fondo + zonas marcadas, en px del diseño).
CREATE TABLE IF NOT EXISTS mk_plantillas (
  id          TEXT PRIMARY KEY,
  marca       TEXT NOT NULL,
  nombre      TEXT NOT NULL,
  ancho       INTEGER NOT NULL,             -- px de diseño (ej. 2000)
  alto        INTEGER NOT NULL,             -- ej. 1141
  fondo_key   TEXT NOT NULL,                -- plantillas/<marca>/<id>  (+ .webp para web, .jpg para PDF)
  zonas       TEXT NOT NULL,                -- JSON: codigo, tallas, precio, zapatilla {x,y,w,h,color,max}
  activa      INTEGER NOT NULL DEFAULT 1,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT now_text()
);

-- Un catálogo = un enlace fijo.
CREATE TABLE IF NOT EXISTS mk_catalogos (
  id                 TEXT PRIMARY KEY,
  slug               TEXT NOT NULL UNIQUE,  -- código aleatorio del enlace (≥ 10 caracteres)
  titulo             TEXT NOT NULL,
  filtros            TEXT NOT NULL,         -- JSON de los filtros usados al generar
  borrador           TEXT NOT NULL,         -- JSON: productos, páginas (con ajustes) y resumen de la generación
  version_publicada  INTEGER,               -- NULL = nunca publicado
  created_by         TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL DEFAULT now_text(),
  updated_at         TEXT NOT NULL DEFAULT now_text()
);

-- Histórico: una fila por publicación (solo datos, sin HTML ni PDF).
CREATE TABLE IF NOT EXISTS mk_catalogo_versiones (
  catalogo_id   TEXT NOT NULL REFERENCES mk_catalogos(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  snapshot      TEXT NOT NULL,              -- JSON completo que lee el visor
  paginas       INTEGER NOT NULL,
  publicado_por TEXT REFERENCES users(id) ON DELETE SET NULL,
  publicado_at  TEXT NOT NULL DEFAULT now_text(),
  PRIMARY KEY (catalogo_id, version)
);
