-- Migracion: MARKETING - equivalencia de tallas (Peru / USA) por marca y genero.
-- Idempotente - seguro de re-ejecutar. Solo ASCII (copiar con: LC_ALL=en_US.UTF-8 pbcopy).
--
-- El ERP entrega la talla en escala USA; los catalogos salen por defecto con la talla peruana. Cada marca calza distinto,
-- asi que la equivalencia se define por (marca, genero): una fila por talla USA.
--   usa     talla USA normalizada ('8', '10.5', '1'); la 'Y' de youth se descarta (ver claveUsa en marketing-tallas.ts)
--   peru    talla peruana
--   pie_cm  largo del pie en cm (dato de referencia; opcional)
-- No toca ninguna tabla existente.
--
-- Reversion:
--   DROP TABLE IF EXISTS mk_tallas;

CREATE TABLE IF NOT EXISTS mk_tallas (
  marca       TEXT NOT NULL,
  genero      TEXT NOT NULL,
  usa         TEXT NOT NULL,
  peru        DOUBLE PRECISION NOT NULL,
  pie_cm      DOUBLE PRECISION,
  updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TEXT NOT NULL DEFAULT now_text(),
  PRIMARY KEY (marca, genero, usa)
);
