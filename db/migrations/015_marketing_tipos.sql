-- Migración: MARKETING — tipos de catálogo en la base de datos (los de siempre y los personalizados).
-- Idempotente — seguro de re-ejecutar (no pisa los cambios que Marketing haga a los tipos).
--
-- Hasta ahora los 9 tipos (Hombres, Mujeres, Niños, Fútbol, Ropa hombre, Ropa mujer, Ropa general, Sandalias y
-- Accesorios) estaban escritos en el código. Aquí pasan a la tabla `mk_tipos`, junto a los que Marketing cree:
--   · `base` = 1 → tipo de fábrica: se puede editar y desactivar, pero no borrar (y se puede restaurar).
--   · `filtros` (JSON): categorias, grupos, generos, marcas, tallas, precio_min y precio_max con los que el asistente
--     llena los filtros al elegir el tipo.
-- Los identificadores de los 9 tipos NO cambian ('hombre', 'mujer'…): las portadas y páginas fijas ya asociadas
-- (`mk_paginas_fijas.auto_tipo`) y los catálogos ya generados siguen funcionando. Los tipos nuevos usan 'c-<código>'.
-- Sin esta tabla el sistema usa los 9 tipos del código, así que se puede aplicar antes o después del despliegue.
--
-- Reversión:
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
  ('hombre', 'Hombres', 'Zapatillas de hombre y unisex', '{"categorias":[],"grupos":["ZAPATILLAS"],"generos":["HOMBRE","UNISEX"],"marcas":[],"tallas":[],"precio_min":null,"precio_max":null}', 1, 1),
  ('mujer', 'Mujeres', 'Zapatillas de mujer y unisex', '{"categorias":[],"grupos":["ZAPATILLAS"],"generos":["MUJER","UNISEX"],"marcas":[],"tallas":[],"precio_min":null,"precio_max":null}', 1, 2),
  ('ninos', 'Niños', 'Zapatillas de junior, preescolar e infante', '{"categorias":[],"grupos":["ZAPATILLAS"],"generos":["JUNIOR","PRESCO","INFANTE"],"marcas":[],"tallas":[],"precio_min":null,"precio_max":null}', 1, 3),
  ('futbol', 'Fútbol', 'Hombres y niños con categoría fútbol: zapatillas, chimpunes, pelotas y accesorios', '{"categorias":["FUTBOL"],"grupos":[],"generos":["HOMBRE","JUNIOR","PRESCO","INFANTE","UNISEX"],"marcas":[],"tallas":[],"precio_min":null,"precio_max":null}', 1, 4),
  ('ropa-hombre', 'Ropa hombre', 'Ropa de hombre y unisex', '{"categorias":[],"grupos":["POLOS","POLERA","SHORT","CASACAS","CAMISETAS","BUZOS","CONJUNTOS","LEGGINS","CANGUROS","BIVIDIS"],"generos":["HOMBRE","UNISEX"],"marcas":[],"tallas":[],"precio_min":null,"precio_max":null}', 1, 5),
  ('ropa-mujer', 'Ropa mujer', 'Ropa de mujer y unisex', '{"categorias":[],"grupos":["POLOS","POLERA","SHORT","CASACAS","CAMISETAS","BUZOS","CONJUNTOS","LEGGINS","CANGUROS","BIVIDIS"],"generos":["MUJER","UNISEX"],"marcas":[],"tallas":[],"precio_min":null,"precio_max":null}', 1, 6),
  ('ropa', 'Ropa general', 'Toda la ropa, de cualquier género', '{"categorias":[],"grupos":["POLOS","POLERA","SHORT","CASACAS","CAMISETAS","BUZOS","CONJUNTOS","LEGGINS","CANGUROS","BIVIDIS"],"generos":[],"marcas":[],"tallas":[],"precio_min":null,"precio_max":null}', 1, 7),
  ('sandalias', 'Sandalias', 'Sandalias de cualquier género', '{"categorias":[],"grupos":["SANDALIAS"],"generos":[],"marcas":[],"tallas":[],"precio_min":null,"precio_max":null}', 1, 8),
  ('accesorios', 'Accesorios', 'Pelotas, gorras, mochilas, medias, canilleras y demás', '{"categorias":[],"grupos":["PELOTAS","GORRAS","MOCHILAS","CANILLERAS","MEDIAS","GUANTES","MALETINES","MITONES","TOMATODO","GORROS","LENTES","MORRAL","RODILLERA","MUSLERA","BOLSOS","CINTA ELASTICA","SOGA PARA SALTAR","BOLSAS","CHIMPUNERA","BILLETERAS","MUÑEQUERAS"],"generos":[],"marcas":[],"tallas":[],"precio_min":null,"precio_max":null}', 1, 9)
ON CONFLICT (id) DO NOTHING;
