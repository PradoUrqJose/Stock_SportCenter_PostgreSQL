// Siembra única de mk_imagenes a partir de la lista de objetos del bucket R2.
// Los códigos ya existentes no se tocan (ON CONFLICT DO NOTHING), así que es
// seguro re-ejecutarlo cuando se suban imágenes nuevas.
//
// Por defecto NO escribe: solo cuenta y muestra una muestra. Agregar --aplicar
// para insertar.
//
// Uso:
//   node scripts/marketing-sembrar-imagenes.mjs <r2_keys.json>            # simulación
//   node --env-file=.env.local scripts/marketing-sembrar-imagenes.mjs <r2_keys.json> --aplicar
//
// <r2_keys.json> = arreglo JSON con las claves del bucket (ej. "022356-01.png").
// Requiere la migración db/migrations/005_marketing_imagenes.sql ya aplicada.
import pg from "pg";
import { readFileSync } from "node:fs";

const archivo = process.argv[2];
const aplicar = process.argv.includes("--aplicar");
if (!archivo) {
  console.error("Uso: node scripts/marketing-sembrar-imagenes.mjs <r2_keys.json> [--aplicar]");
  process.exit(1);
}

const claves = JSON.parse(readFileSync(archivo, "utf8"));
if (!Array.isArray(claves)) {
  console.error("El archivo debe contener un arreglo JSON de claves.");
  process.exit(1);
}

// Solo PNG en la raíz del bucket (los derivados y _prueba_catalogo/ van en prefijos).
const codigos = [
  ...new Set(
    claves
      .filter((k) => typeof k === "string" && !k.includes("/") && /\.png$/i.test(k))
      .map((k) => k.replace(/\.png$/i, "").trim().toUpperCase())
      .filter(Boolean)
  ),
];

console.log(`Claves en el archivo: ${claves.length} · códigos únicos a sembrar: ${codigos.length}`);
console.log(`Muestra: ${codigos.slice(0, 3).join(", ")} … ${codigos.slice(-2).join(", ")}`);

if (!aplicar) {
  console.log("Simulación: no se escribió nada. Agregar --aplicar para insertar.");
  process.exit(0);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  const r = await client.query(
    `INSERT INTO mk_imagenes (cod_universal)
     SELECT unnest($1::text[])
     ON CONFLICT (cod_universal) DO NOTHING`,
    [codigos]
  );
  console.log(`OK: ${r.rowCount} códigos nuevos insertados (${codigos.length - r.rowCount} ya existían).`);
} finally {
  await client.end();
}
