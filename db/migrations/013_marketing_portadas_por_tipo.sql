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
