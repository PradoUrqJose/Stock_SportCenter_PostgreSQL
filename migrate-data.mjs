// Copia ÚNICA de datos Turso (libSQL) → Neon (PostgreSQL).
// Idempotente: usa ON CONFLICT DO NOTHING, se puede re-ejecutar sin duplicar.
//
// Requiere estas variables de entorno (NO se pisan entre sí):
//   TURSO_DATABASE_URL   libsql://...           (origen, lectura)
//   TURSO_AUTH_TOKEN     <token de Turso>       (origen)
//   DATABASE_URL         postgresql://...       (destino Neon, escritura)
//
// Uso (una sola línea, con las 3 vars exportadas):
//   node migrate-data.mjs
import pg from "pg";
import { createClient } from "@libsql/client";

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;
const DEST_URL = process.env.DATABASE_URL;

if (!TURSO_URL) throw new Error("Falta TURSO_DATABASE_URL (origen).");
if (!DEST_URL || !/^postgres/.test(DEST_URL))
  throw new Error("DATABASE_URL debe ser el string de Neon (postgresql://...).");

const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
const dest = new pg.Client({ connectionString: DEST_URL, ssl: { rejectUnauthorized: false } });

// Tablas en orden de dependencia (FK). rate_limits se omite (efímera).
const TABLES = [
  ["tiendas", ["id", "nombre", "excluida_actualizacion", "created_at"]],
  ["users", ["id", "username", "email", "password", "nombre", "rol", "tienda_id", "activo", "created_at"]],
  ["modules", ["id", "nombre", "ruta", "descripcion", "orden"]],
  ["admin_modules", ["user_id", "module_id"]],
  ["vendedores", ["id", "nombre", "codigo", "tienda_id", "activo", "created_at"]],
  ["producto_imagenes", ["cod_universal", "imagen_url", "source", "updated_at"]],
  ["productos", ["cod_universal", "genero", "marca", "modelo", "categoria", "grupo", "color", "precio_lista", "descuento", "stock_total"]],
  ["variantes", ["cod_barras", "cod_universal", "genero", "talla", "alm_izq", "alm_der", "cod_prod", "precio_compra", "ingreso_fecha"]],
  ["ventas", ["id", "cod_barras", "cod_universal", "genero", "fecha_venta", "ingreso_fecha", "almacen", "marca", "modelo", "categoria", "grupo", "color", "talla", "precio_compra", "precio_lista", "importe", "imported_at"]],
  ["lotes", ["id", "estado", "created_at", "created_by", "published_at", "published_by", "closed_at", "closed_by", "resanado_at", "resanado_by"]],
  ["lote_lineas", ["id", "lote_id", "cod_universal", "genero", "descuento_antes", "descuento_nuevo", "snap_marca", "snap_modelo", "snap_categoria", "snap_color", "snap_precio_lista", "snap_precio_compra", "editado_at"]],
  ["lote_exclusiones", ["lote_id", "tienda_id", "excluida_at", "excluida_by"]],
  ["confirmaciones", ["id", "lote_id", "tienda_id", "cod_universal", "genero", "estado", "resuelto_at", "vendedor_id", "codigo_usado", "motivo_rechazo"]],
  ["sync_log", ["id", "tipo", "filas", "ejecutado_at", "ejecutado_by"]],
];

// Tablas con columna id IDENTITY: hay que reajustar la secuencia tras insertar ids explícitos.
const SEQ_TABLES = ["vendedores", "ventas", "lotes", "lote_lineas", "confirmaciones", "sync_log"];

const BATCH = 500;

async function copyTable(name, cols) {
  const src = await turso.execute(`SELECT ${cols.join(", ")} FROM ${name}`);
  const rows = src.rows;
  if (rows.length === 0) {
    console.log(`  ${name}: 0 filas (nada que copiar)`);
    return;
  }
  let copied = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const tuples = [];
    const params = [];
    let p = 0;
    for (const row of chunk) {
      tuples.push(`(${cols.map(() => `$${++p}`).join(",")})`);
      for (const c of cols) params.push(row[c] ?? null);
    }
    const sql = `INSERT INTO ${name} (${cols.join(",")}) VALUES ${tuples.join(",")} ON CONFLICT DO NOTHING`;
    const res = await dest.query(sql, params);
    copied += res.rowCount ?? 0;
  }
  console.log(`  ${name}: ${copied}/${rows.length} filas copiadas`);
}

async function resetSeq(name) {
  await dest.query(
    `SELECT setval(pg_get_serial_sequence($1, 'id'),
                   GREATEST((SELECT COALESCE(MAX(id), 1) FROM ${name}), 1))`,
    [name]
  );
}

await dest.connect();
try {
  console.log("Copiando datos Turso → Neon…");
  for (const [name, cols] of TABLES) {
    await copyTable(name, cols);
  }
  console.log("Reajustando secuencias IDENTITY…");
  for (const name of SEQ_TABLES) {
    await resetSeq(name);
    console.log(`  ${name}.id → secuencia sincronizada`);
  }
  console.log("✓ Migración de datos completa.");
} catch (e) {
  console.error("ERROR en migración de datos:", e.message);
  process.exitCode = 1;
} finally {
  await dest.end();
}
