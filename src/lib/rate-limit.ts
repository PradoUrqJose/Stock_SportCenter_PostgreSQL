import { db } from "./db";

// Persistido en Turso (tabla rate_limits) en vez de memoria de proceso: en
// serverless cada invocación puede caer en una instancia distinta, así que
// un contador en memoria no protege nada entre requests.
export async function rateLimit(ip: string, limit = 10, windowMs = 60_000): Promise<boolean> {
  const now = Date.now();
  const result = await db.execute({
    sql: "SELECT intentos, reset_at FROM rate_limits WHERE clave = ?",
    args: [ip],
  });
  const row = result.rows[0];

  if (!row || (row.reset_at as number) <= now) {
    await db.execute({
      sql: `INSERT INTO rate_limits (clave, intentos, reset_at) VALUES (?, 1, ?)
            ON CONFLICT(clave) DO UPDATE SET intentos = 1, reset_at = excluded.reset_at`,
      args: [ip, now + windowMs],
    });
    return true;
  }

  if ((row.intentos as number) >= limit) return false;

  await db.execute({
    sql: "UPDATE rate_limits SET intentos = intentos + 1 WHERE clave = ?",
    args: [ip],
  });
  return true;
}
