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
