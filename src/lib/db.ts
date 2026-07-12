import pg from "pg";

// Instancia del proceso: si esto es un cold start de la función serverless,
// se recalcula en cada arranque. Permite distinguir cold start vs. query lenta.
const processStartedAt = Date.now();
console.log(`[PERF][db] módulo cargado @ ${new Date(processStartedAt).toISOString()}`);

// PostgreSQL devuelve int8 (bigint, p.ej. COUNT(*)) y numeric como STRING por
// defecto. SQLite/libSQL los daba como number, y el código hace `as number` y
// aritmética directa. Registramos parsers para que vuelvan como number JS y no
// se rompan comparaciones (`n > 0`) ni cálculos. Los precios son DOUBLE PRECISION
// (float8), que pg ya devuelve como number.
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // int8
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // numeric

// Neon exige SSL. El pooler puede no coincidir con el hostname del certificado,
// así que ciframos sin verificar la cadena (la conexión sigue siendo TLS).
const connectionString = process.env.DATABASE_URL!;

// Singleton reutilizable entre requests (lambda tibia) y entre recargas de HMR en
// dev — evita agotar conexiones del pooler de Neon.
const globalForDb = globalThis as unknown as { _pgPool?: pg.Pool };
const pool =
  globalForDb._pgPool ??
  new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
if (!globalForDb._pgPool) globalForDb._pgPool = pool;

// --- Tipos que reproducen la interfaz de @libsql/client usada por la app ---
type Args = unknown[];
type Row = Record<string, unknown>;
export type InStatement = string | { sql: string; args?: Args };
export type ExecResult = { rows: Row[]; rowsAffected: number };

// El código usa placeholders posicionales `?` (convención libSQL). PostgreSQL usa
// `$1, $2, …`. Convertimos en orden de aparición; los args viajan igual.
function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function stmtParts(stmt: InStatement): { sql: string; args: Args } {
  if (typeof stmt === "string") return { sql: stmt, args: [] };
  return { sql: stmt.sql, args: stmt.args ?? [] };
}

function sqlLabel(sql: string): string {
  return sql.trim().replace(/\s+/g, " ").slice(0, 90);
}

let queryCount = 0;

async function execute(stmt: InStatement): Promise<ExecResult> {
  const { sql, args } = stmtParts(stmt);
  const n = ++queryCount;
  const procesoVivoMs = Date.now() - processStartedAt;
  const t0 = Date.now();
  try {
    const res = await pool.query(toPg(sql), args);
    return { rows: res.rows as Row[], rowsAffected: res.rowCount ?? 0 };
  } finally {
    const ms = Date.now() - t0;
    console.log(
      `[PERF][db#${n}] ${ms}ms | proceso vivo ${procesoVivoMs}ms | ${sqlLabel(sql)}`
    );
  }
}

// Reemplaza db.batch([...], "write") de libSQL: ejecuta todas las sentencias en
// una única transacción (BEGIN/COMMIT), con rollback ante cualquier error.
async function batch(
  stmts: InStatement[],
  _mode?: "write" | "read" | "deferred"
): Promise<ExecResult[]> {
  const n = ++queryCount;
  const procesoVivoMs = Date.now() - processStartedAt;
  const t0 = Date.now();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out: ExecResult[] = [];
    for (const stmt of stmts) {
      const { sql, args } = stmtParts(stmt);
      const res = await client.query(toPg(sql), args);
      out.push({ rows: res.rows as Row[], rowsAffected: res.rowCount ?? 0 });
    }
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    const ms = Date.now() - t0;
    console.log(
      `[PERF][db#${n}] batch(${stmts.length}) ${ms}ms | proceso vivo ${procesoVivoMs}ms`
    );
  }
}

export const db = { execute, batch };

// Compat: los rows de pg ya son objetos planos serializables por React Flight;
// esta copia es inofensiva y evita tocar los ~40 call-sites que la usan.
export function toPlain<T>(rows: unknown[]): T[] {
  return rows.map((r) => ({ ...(r as object) })) as T[];
}
