// Siembra la plantilla de PRUEBA (diseño verde de Adidas) para el módulo de
// catálogos: sube el fondo a R2 (WebP para la web, JPEG para el PDF futuro) y
// registra la plantilla en mk_plantillas. Sirve mientras Marketing no entrega
// los diseños reales (esos se subirán desde la pantalla de plantillas).
//
// Idempotente: sobrescribe los mismos objetos y actualiza la fila.
// Requiere las variables de .env.local (R2_* y DATABASE_URL) y la migración 007.
//
// Uso (desde la raíz de STOCK_SC):
//   node --env-file=.env.local scripts/marketing-sembrar-plantilla.mjs <carpeta con adidas.webp y adidas.jpg>
//   ej.: ~/Documents/Code/Projects/PruebaCatalogo/derivados/fondos
//
// Reversión: borrar plantillas/adidas/ del bucket y
//   DELETE FROM mk_plantillas WHERE id = 'adidas-prueba';
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AwsClient } from "aws4fetch";
import pg from "pg";

const carpeta = process.argv[2];
if (!carpeta) {
  console.error("Uso: node --env-file=.env.local scripts/marketing-sembrar-plantilla.mjs <carpeta con adidas.webp y adidas.jpg>");
  process.exit(1);
}

const ID = "adidas-prueba";
const CLAVE = `plantillas/adidas/${ID}`;
// Zonas del diseño de referencia (2000x1141), en px del diseño.
const ZONAS = {
  codigo: { x: 352, y: 160, w: 212, h: 75, color: "#ffffff", max: 46 },
  tallas: { x: 100, y: 488, w: 450, h: 160, color: "#1a3aa8", max: 44 },
  precio: { x: 100, y: 815, w: 450, h: 170, color: "#1a3aa8", max: 84 },
  zapatilla: { x: 820, y: 170, w: 1000, h: 1000 },
};

const aws = new AwsClient({
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  service: "s3",
  region: "auto",
});
const base = `${process.env.R2_ENDPOINT.replace(/\/+$/, "")}/${process.env.R2_BUCKET}`;

for (const [ext, tipo] of [["webp", "image/webp"], ["jpg", "image/jpeg"]]) {
  const cuerpo = readFileSync(join(carpeta, `adidas.${ext}`));
  const res = await aws.fetch(`${base}/${CLAVE}.${ext}`, {
    method: "PUT",
    body: cuerpo,
    headers: {
      "Content-Type": tipo,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(cuerpo.byteLength),
    },
  });
  if (!res.ok) throw new Error(`R2 PUT ${CLAVE}.${ext} falló (${res.status})`);
  console.log(`R2 ✔ ${CLAVE}.${ext} (${(cuerpo.byteLength / 1024).toFixed(0)} KB)`);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(
    `INSERT INTO mk_plantillas (id, marca, nombre, ancho, alto, fondo_key, zonas)
     VALUES ($1, 'ADIDAS', 'Adidas (diseño de prueba)', 2000, 1141, $2, $3)
     ON CONFLICT (id) DO UPDATE SET fondo_key = excluded.fondo_key, zonas = excluded.zonas, activa = 1`,
    [ID, CLAVE, JSON.stringify(ZONAS)]
  );
  console.log(`Neon ✔ mk_plantillas.${ID}`);
} finally {
  await client.end();
}
