// Aplica un archivo .sql contra PostgreSQL (Neon).
// Uso: node apply-migration.mjs db/schema_postgres.sql
//
// Ejecuta el archivo COMPLETO en una sola llamada (el protocolo simple de pg admite
// múltiples sentencias separadas por ';'). NO se hace split(';') porque el cuerpo
// de la función now_text() contiene ';' dentro de $$ … $$.
import pg from "pg";
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Uso: node apply-migration.mjs db/archivo.sql");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query(sql);
  console.log(`OK: ${file} aplicado.`);
} catch (e) {
  console.error(`ERROR aplicando ${file}:`, e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
