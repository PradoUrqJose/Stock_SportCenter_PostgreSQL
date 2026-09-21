-- Migraciones del módulo MARKETING (005 a 014), en orden. Idempotentes: seguras de ejecutar más de una vez.
-- Solo CREAN tablas mk_* y agregan columnas a ellas, salvo una fila nueva en la tabla modules (el módulo «Marketing»).
-- No modifican ni borran nada de las tablas del sistema STOCK.

-- ===================== 005_marketing_imagenes.sql =====================
-- Migración: módulo MARKETING — fase 1 (IMAGENES).
-- Idempotente — seguro de re-ejecutar.
--
-- Solo lo necesario para listar/reemplazar imágenes. Las tablas de plantillas,
-- páginas fijas y catálogos llegan en migraciones propias cuando se construyan
-- esas fases (ver PruebaCatalogo/docs/04-plan-integracion-stock-sc.md).
--
-- Reversión:
--   DELETE FROM admin_modules WHERE module_id = 'marketing';
--   DELETE FROM modules WHERE id = 'marketing';
--   DROP TABLE IF EXISTS mk_imagenes;

-- Versión vigente de cada imagen de producto guardada en R2. `version` entra
-- en el nombre de los derivados WebP (`<COD>.v<N>.webp`) y en la URL del PNG
-- para invalidar caché al reemplazar. cod_universal va SIEMPRE en MAYÚSCULAS.
CREATE TABLE IF NOT EXISTS mk_imagenes (
  cod_universal TEXT PRIMARY KEY,
  version       INTEGER NOT NULL DEFAULT 1,
  updated_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at    TEXT NOT NULL DEFAULT now_text()
);

INSERT INTO modules (id, nombre, ruta, descripcion, orden) VALUES
  ('marketing', 'Marketing', '/admin/marketing', 'Imágenes y catálogos para clientes', 13)
ON CONFLICT (id) DO NOTHING;

-- ===================== 006_marketing_imagen_url.sql =====================
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

-- ===================== 007_marketing_catalogos.sql =====================
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

-- ===================== 008_marketing_version_borrador.sql =====================
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

-- ===================== 009_marketing_generaciones.sql =====================
-- Migración: MARKETING — generación de catálogos en segundo plano + historial.
-- Idempotente — seguro de re-ejecutar.
--
-- Una fila por cada vez que se pide generar un catálogo: mientras corre guarda
-- la etapa (para la barra de avance) y al terminar deja el catálogo creado o el
-- error. Sirve también de historial (quién, cuándo, con qué filtros).
--
-- Reversión:
--   DROP TABLE IF EXISTS mk_generaciones;

CREATE TABLE IF NOT EXISTS mk_generaciones (
  id           TEXT PRIMARY KEY,
  titulo       TEXT NOT NULL,
  filtros      TEXT NOT NULL,                 -- JSON de los filtros pedidos
  estado       TEXT NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso', 'listo', 'error')),
  etapa        TEXT NOT NULL DEFAULT 'erp',   -- erp | armando | guardando
  mensaje      TEXT,                          -- resultado o motivo del error
  catalogo_id  TEXT REFERENCES mk_catalogos(id) ON DELETE SET NULL,
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT now_text(),
  finished_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_mk_generaciones_created ON mk_generaciones (created_at DESC);

-- ===================== 010_marketing_paginas_fijas.sql =====================
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

-- ===================== 011_marketing_plantillas_gestion.sql =====================
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

-- ===================== 012_marketing_fijas_aplica.sql =====================
-- Migración: MARKETING — a qué catálogos se aplica cada página fija.
-- Idempotente — seguro de re-ejecutar.
--
-- `auto_tipo` pasa a ser una LISTA de tipos de catálogo separados por coma ('hombre,mujer') o '*'
-- (todos). Con `auto_posicion` = 'inicio'/'final' la generación pone la página sola; con
-- `auto_posicion` NULL la página solo se SUGIERE (aparece en el Preview y se coloca a mano en el editor).
-- Los separadores de fútbol se sugieren en los catálogos de fútbol.
--
-- Reversión: UPDATE mk_paginas_fijas SET auto_tipo = NULL WHERE tipo = 'separador';

UPDATE mk_paginas_fijas SET auto_tipo = 'futbol'
WHERE tipo = 'separador' AND auto_tipo IS NULL AND auto_posicion IS NULL;

-- ===================== 013_marketing_portadas_por_tipo.sql =====================
-- Migración: MARKETING — cada portada fija queda asociada a su tipo de catálogo.
-- Idempotente — seguro de re-ejecutar.
--
-- Tipos de catálogo: hombre, mujer, ninos, futbol, ropa-hombre, ropa-mujer, ropa, sandalias, accesorios.
-- La portada de Hombres sirve también al tipo fútbol mientras no haya una portada propia de fútbol
-- (si se sube una que liste solo `futbol`, esa gana por ser más específica).
--
-- Reversión: UPDATE mk_paginas_fijas SET auto_tipo = NULL, auto_posicion = NULL WHERE tipo = 'portada';

UPDATE mk_paginas_fijas SET auto_tipo = 'hombre,futbol', auto_posicion = 'inicio' WHERE id = 'portada-hombres';
UPDATE mk_paginas_fijas SET auto_tipo = 'mujer',         auto_posicion = 'inicio' WHERE id = 'portada-mujeres';
UPDATE mk_paginas_fijas SET auto_tipo = 'ninos',         auto_posicion = 'inicio' WHERE id = 'portada-ninos';
UPDATE mk_paginas_fijas SET auto_tipo = 'accesorios',    auto_posicion = 'inicio' WHERE id = 'portada-accesorios';
UPDATE mk_paginas_fijas SET auto_tipo = 'sandalias',     auto_posicion = 'inicio' WHERE id = 'portada-sandalias';
UPDATE mk_paginas_fijas SET auto_tipo = 'ropa',          auto_posicion = 'inicio' WHERE id = 'portada-ropa';
UPDATE mk_paginas_fijas SET auto_tipo = 'ropa-hombre',   auto_posicion = 'inicio' WHERE id = 'portada-ropa-hombre';
UPDATE mk_paginas_fijas SET auto_tipo = 'ropa-mujer',    auto_posicion = 'inicio' WHERE id = 'portada-ropa-mujer';

-- ===================== 014_marketing_zonas_clicables.sql =====================
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

-- ===================== 015_marketing_tipos.sql =====================
-- Migracion: MARKETING - tipos de catalogo en la base de datos (los de siempre y los personalizados).
-- Idempotente - seguro de re-ejecutar (no pisa los cambios que Marketing haga a los tipos).
--
-- Hasta ahora los 9 tipos (Hombres, Mujeres, Ninos, Futbol, Ropa hombre, Ropa mujer, Ropa general, Sandalias y
-- Accesorios) estaban escritos en el codigo. Aqui pasan a la tabla `mk_tipos`, junto a los que Marketing cree:
--   - `base` = 1 -> tipo de fabrica: se puede editar y desactivar, pero no borrar (y se puede restaurar).
--   - `filtros` (JSON): categorias, grupos, generos, marcas, tallas, precio_min y precio_max con los que el asistente
--     llena los filtros al elegir el tipo.
-- Los identificadores de los 9 tipos NO cambian ('hombre', 'mujer'...): las portadas y paginas fijas ya asociadas
-- (`mk_paginas_fijas.auto_tipo`) y los catalogos ya generados siguen funcionando. Los tipos nuevos usan 'c-<codigo>'.
-- Sin esta tabla el sistema usa los 9 tipos del codigo, asi que se puede aplicar antes o despues del despliegue.
--
-- Nota: todo el SQL de este archivo es ASCII (las tildes y enes van como \uXXXX): se puede copiar y pegar
-- desde cualquier terminal o editor sin que se danen los acentos.
--
-- Reversion:
--   DROP TABLE IF EXISTS mk_tipos;

CREATE TABLE IF NOT EXISTS mk_tipos (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  filtros     TEXT NOT NULL,
  base        INTEGER NOT NULL DEFAULT 0,
  activo      INTEGER NOT NULL DEFAULT 1,
  orden       INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT now_text(),
  updated_at  TEXT NOT NULL DEFAULT now_text()
);

INSERT INTO mk_tipos (id, nombre, descripcion, filtros, base, orden) VALUES
  ('hombre', E'Hombres', E'Zapatillas de hombre y unisex', $j${"categorias":[],"grupos":["ZAPATILLAS"],"generos":["HOMBRE","UNISEX"],"marcas":[],"tallas":[],"precio_min":null,"precio_max":null}$j$, 1, 1),
  ('mujer', E'Mujeres', E'Zapatillas de mujer y unisex', $j${"categorias":[],"grupos":["ZAPATILLAS"],"generos":["MUJER","UNISEX"],"marcas":[],"tallas":[],"precio_min":null,"precio_max":null}$j$, 1, 2),
  ('ninos', E'Ni\u00f1os', E'Zapatillas de junior, preescolar e infante', $j${"categorias":[],"grupos":["ZAPATILLAS"],"generos":["JUNIOR","PRESCO","INFANTE"],"marcas":[],"tallas":[],"precio_min":null,"precio_max":null}$j$, 1, 3),
  ('futbol', E'F\u00fatbol', E'Hombres y ni\u00f1os con categor\u00eda f\u00fatbol: zapatillas, chimpunes, pelotas y accesorios', $j${"categorias":["FUTBOL"],"grupos":[],"generos":["HOMBRE","JUNIOR","PRESCO","INFANTE","UNISEX"],"marcas":[],"tallas":[],"precio_min":null,"precio_max":null}$j$, 1, 4),
  ('ropa-hombre', E'Ropa hombre', E'Ropa de hombre y unisex', $j${"categorias":[],"grupos":["POLOS","POLERA","SHORT","CASACAS","CAMISETAS","BUZOS","CONJUNTOS","LEGGINS","CANGUROS","BIVIDIS"],"generos":["HOMBRE","UNISEX"],"marcas":[],"tallas":[],"precio_min":null,"precio_max":null}$j$, 1, 5),
  ('ropa-mujer', E'Ropa mujer', E'Ropa de mujer y unisex', $j${"categorias":[],"grupos":["POLOS","POLERA","SHORT","CASACAS","CAMISETAS","BUZOS","CONJUNTOS","LEGGINS","CANGUROS","BIVIDIS"],"generos":["MUJER","UNISEX"],"marcas":[],"tallas":[],"precio_min":null,"precio_max":null}$j$, 1, 6),
  ('ropa', E'Ropa general', E'Toda la ropa, de cualquier g\u00e9nero', $j${"categorias":[],"grupos":["POLOS","POLERA","SHORT","CASACAS","CAMISETAS","BUZOS","CONJUNTOS","LEGGINS","CANGUROS","BIVIDIS"],"generos":[],"marcas":[],"tallas":[],"precio_min":null,"precio_max":null}$j$, 1, 7),
  ('sandalias', E'Sandalias', E'Sandalias de cualquier g\u00e9nero', $j${"categorias":[],"grupos":["SANDALIAS"],"generos":[],"marcas":[],"tallas":[],"precio_min":null,"precio_max":null}$j$, 1, 8),
  ('accesorios', E'Accesorios', E'Pelotas, gorras, mochilas, medias, canilleras y dem\u00e1s', $j${"categorias":[],"grupos":["PELOTAS","GORRAS","MOCHILAS","CANILLERAS","MEDIAS","GUANTES","MALETINES","MITONES","TOMATODO","GORROS","LENTES","MORRAL","RODILLERA","MUSLERA","BOLSOS","CINTA ELASTICA","SOGA PARA SALTAR","BOLSAS","CHIMPUNERA","BILLETERAS","MU\u00d1EQUERAS"],"generos":[],"marcas":[],"tallas":[],"precio_min":null,"precio_max":null}$j$, 1, 9)
ON CONFLICT (id) DO NOTHING;
