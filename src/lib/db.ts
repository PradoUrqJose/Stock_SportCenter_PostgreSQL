import { createClient } from "@libsql/client";

export const db = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
  // Local file: SQLite fails writes with SQLITE_BUSY immediately when another
  // connection holds the lock. Wait for the lock instead. Ignored by remote (Turso).
  timeout: 15000,
});

// @libsql/client rows have a non-enumerable `length` property that React Flight rejects.
// Spread copies only enumerable own properties, producing a plain serializable object.
export function toPlain<T>(rows: unknown[]): T[] {
  return rows.map((r) => ({ ...(r as object) })) as T[];
}
