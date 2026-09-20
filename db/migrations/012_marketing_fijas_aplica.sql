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
