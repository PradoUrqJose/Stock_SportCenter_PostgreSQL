import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Uso: node apply-migration.mjs db/migrations/00X_archivo.sql");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");
const statements = sql
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"));

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

for (const stmt of statements) {
  await db.execute(stmt);
  console.log("OK:", stmt.split("\n")[0].slice(0, 80));
}

console.log(`OK: ${file} aplicado.`);
