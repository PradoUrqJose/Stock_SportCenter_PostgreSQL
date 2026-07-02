import { createClient, type InStatement } from "@libsql/client";
import os from "node:os";
import path from "node:path";

// Instancia del proceso: si esto es un cold start de la función serverless,
// se recalcula en cada arranque. Permite distinguir cold start vs. query lenta.
const processStartedAt = Date.now();
console.log(`[PERF][db] módulo cargado @ ${new Date(processStartedAt).toISOString()}`);

const databaseUrl = process.env.DATABASE_URL!;
const isRemote = /^(libsql:|https:|wss:)/.test(databaseUrl);

// Turso remoto ejecuta el SQL en su propio motor sobre HTTP/WS: para este catálogo
// (decenas de miles de filas) eso resultó anormalmente lento incluso para operaciones
// triviales (PRAGMA integrity_check tardó 28s en una base de 13MB). En vez de leer
// contra ese motor remoto en cada request, usamos un embedded replica: un archivo
// SQLite local que se sincroniza con el primario. Las lecturas van contra el archivo
// local; los INSERT/UPDATE/DELETE se reenvían solos al primario (read-your-writes
// garantizado por @libsql/client, sin necesidad de sync manual tras escribir).
export const db = isRemote
  ? createClient({
      url: `file:${path.join(os.tmpdir(), "stock-descuentos-replica.db")}`,
      syncUrl: databaseUrl,
      authToken: process.env.DATABASE_AUTH_TOKEN,
      syncInterval: 10,
    })
  : createClient({
      url: databaseUrl,
      authToken: process.env.DATABASE_AUTH_TOKEN,
      // Local file: SQLite fails writes with SQLITE_BUSY immediately when another
      // connection holds the lock. Wait for the lock instead. Ignored by remote (Turso).
      timeout: 15000,
    });

// Un archivo de réplica recién creado empieza vacío: la primera query de una
// instancia fría debe esperar una sincronización completa antes de leer, o vería
// el catálogo vacío. Memoizado: en instancias tibias es un await sobre una promesa
// ya resuelta (costo ~0). Las sincronizaciones siguientes las hace `syncInterval` solo.
let initialSync: Promise<unknown> | null = null;
function ensureSynced(): Promise<unknown> {
  if (!isRemote) return Promise.resolve();
  if (!initialSync) {
    const t0 = Date.now();
    initialSync = db
      .sync()
      .then(() => {
        console.log(`[PERF][db] sync inicial ${Date.now() - t0}ms`);
      })
      .catch((err) => {
        initialSync = null;
        throw err;
      });
  }
  return initialSync;
}

// --- Instrumentación temporal de performance ---
// Loguea la duración de cada query/batch y desde cuándo está vivo este proceso,
// para distinguir cold start de Vercel/Turso de una consulta realmente lenta.
// Sacar una vez que tengamos el diagnóstico.
let queryCount = 0;

function sqlLabel(stmt: InStatement): string {
  const sql = typeof stmt === "string" ? stmt : stmt.sql;
  return sql.trim().replace(/\s+/g, " ").slice(0, 90);
}

const rawExecute = db.execute.bind(db);
(db as { execute: unknown }).execute = async (stmt: InStatement) => {
  await ensureSynced();
  const n = ++queryCount;
  const procesoVivoMs = Date.now() - processStartedAt;
  const t0 = Date.now();
  try {
    return await rawExecute(stmt);
  } finally {
    const ms = Date.now() - t0;
    console.log(
      `[PERF][db#${n}] ${ms}ms | proceso vivo ${procesoVivoMs}ms | ${sqlLabel(stmt)}`
    );
  }
};

const rawBatch = db.batch.bind(db);
(db as { batch: unknown }).batch = async (
  stmts: InStatement[],
  mode?: Parameters<typeof rawBatch>[1]
) => {
  await ensureSynced();
  const n = ++queryCount;
  const procesoVivoMs = Date.now() - processStartedAt;
  const t0 = Date.now();
  try {
    return await rawBatch(stmts, mode);
  } finally {
    const ms = Date.now() - t0;
    console.log(
      `[PERF][db#${n}] batch(${stmts.length}) ${ms}ms | proceso vivo ${procesoVivoMs}ms`
    );
  }
};

// @libsql/client rows have a non-enumerable `length` property that React Flight rejects.
// Spread copies only enumerable own properties, producing a plain serializable object.
export function toPlain<T>(rows: unknown[]): T[] {
  return rows.map((r) => ({ ...(r as object) })) as T[];
}
