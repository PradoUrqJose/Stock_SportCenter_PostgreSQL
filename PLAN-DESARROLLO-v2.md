⏺ Voy a mapear con precisión todo el SQL específico de SQLite que hay que convertir, el esquema completo, y cómo se consumen los resultados de libsql. Lanzo la exploración en paralelo.

⏺ 3 Explore agents finished (ctrl+o to expand) ├ Enumerate SQLite-specific SQL · 25 tool uses · 48.3k tokens │ ⎿ Done ├ Reconstruct full schema and migrations · 13 tool uses · 21.7k tokens │ ⎿ Done └ Map libsql result consumption · 30 tool uses · 56.4k tokens ⎿ Done

⏺ Tengo el inventario completo. Antes de escribir el plan, la exploración reveló un dato decisivo que cambia la estrategia respecto a lo que propuso Haiku:

El código usa result.rows en 95+ lugares y .rowsAffected en 3. postgres.js (lo que Haiku eligió) devuelve el array directo sin .rows, lo que obligaría a reescribir ~100 sitios — mucho riesgo. En cambio node-postgres (pg) devuelve { rows, rowCount } nativamente, que ya calza con tu código. Con un adaptador delgado que imite la interfaz de libSQL (db.execute/db.batch), casi ningún archivo de página o acción se toca — solo db.ts, el SQL de dialecto, y el esquema.

Voy a escribir el plan con esa estrategia.

⏺ Updated plan ⎿ /plan to preview

⏺ El plan está listo. Resumen de lo esencial y en qué corrige al de Haiku:

La estrategia clave: usar pg (node-postgres) con un adaptador delgado en db.ts que imita la interfaz actual de libSQL. Como pg ya devuelve { rows, rowCount }, no se tocan las ~95 páginas/acciones que usan .rows, ni los 3 .rowsAffected, ni los 42 toPlain(). Solo cambia db.ts, el texto SQL con dialecto SQLite, y el esquema. Haiku iba a usar postgres.js, que habría forzado reescribir ~100 sitios.

Correcciones concretas sobre el plan de Haiku:

- Su conversión de julianday (EXTRACT(DAY FROM date−date)) está mal — en Postgres date − date ya es entero. El plan usa (a::date - b::date).
- Omitió migrar los datos (35k ventas + usuarios/tiendas/lotes). El plan añade migrate-data.mjs con reseteo de secuencias.
- Trap silencioso que nadie mencionó: COUNT(\*) en Postgres es bigint y pg lo devuelve como string → rompería n > 0 y la aritmética. El plan configura type parsers para int8/numeric y usa double precision en precios.
- El apply-migration.mjs con split(";") rompería con la función now_text(); se ejecuta el archivo entero de una.

Un punto honesto: Neon free "duerme" tras ~5 min inactivo, así que la primera visita del día costará ~1s. Para 20 personas usándolo en jornada, es irrelevante — pero es real y lo dejo dicho, no oculto como en la conversación anterior.

───────────────────────────────────────────────────────────────────────────────────────────────────── Ready to code?

Here is Claude's plan: ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ Plan: Migración Turso/libSQL → PostgreSQL (Neon)

Contexto

La app corre sobre Turso (SQLite servido por HTTP). Ese motor es lento por diseño para este patrón — no por el tamaño de los datos, que es diminuto (≈3.5k productos, 13k variantes, 35k ventas). El síntoma real (mañana lento / noche rápido) viene del embedded replica local + sync, del cold-start de la función serverless que descarga la réplica antes de la primera query, y del rebuild diario de ~28k filas que dispara syncs pesados. El parche de caché/réplica que existe hoy (src/lib/db.ts) tapa el problema en vez de resolverlo.

PostgreSQL es un servidor de base de datos real, diseñado para responder por red en milisegundos. Migrar elimina de raíz: el motor equivocado (SQLite-por-HTTP), la réplica local, el sync cada 10s y el caché ad-hoc. Resultado esperado: ~50–300ms estables en Análisis y Actualización, sin ninguna capa de "alta ingeniería".

Objetivo: migrar a Neon Postgres 16 (us-east-1, endpoint pooled) con el mínimo de cambios de código posible y preservando los datos históricos (ventas, usuarios, tiendas, lotes, confirmaciones).

---

Decisión de arquitectura (corrige el plan de Haiku)

1.  Driver: pg (node-postgres), NO postgres.js. El código consume result.rows en 95+ sitios y result.rowsAffected en 3. pg devuelve { rows, rowCount } nativo → calza con lo que ya existe. postgres.js devuelve el array directo y obligaría a reescribir ~100 call-sites (riesgo enorme).
2.  Adaptador delgado en src/lib/db.ts que reexpone la MISMA interfaz de libSQL:

- db.execute(stringSQL) y db.execute({ sql, args })
- db.batch(stmts, "write") → transacción BEGIN/COMMIT
- Devuelve { rows, rowsAffected } (mapeando rowCount → rowsAffected)
- Convierte placeholders posicionales ? → $1, $2, … internamente Con esto, las páginas y acciones NO cambian (ni .rows, ni .rowsAffected, ni toPlain()). Solo cambia db.ts + el TEXTO SQL con dialecto SQLite.

3.  Se elimina toda la lógica de réplica/sync: syncUrl, syncInterval, ensureSynced(), el archivo en os.tmpdir() y DATABASE_AUTH_TOKEN.
4.  toPlain() se conserva (los rows de pg ya son objetos planos; la función queda inofensiva) para no tocar 42 archivos.

---

Archivos a modificar

1.  src/lib/db.ts — reescribir completo

- Crear un pg.Pool singleton (patrón serverless, max pequeño p.ej. 3, idleTimeoutMillis), usando process.env.DATABASE_URL (endpoint pooled de Neon).
- Type parsers críticos (evita el bug silencioso de COUNT(_) → string): import pg from "pg"; pg.types.setTypeParser(20, v => v === null ? null : parseInt(v, 10)); // int8 / COUNT(_) pg.types.setTypeParser(1700, v => v === null ? null : parseFloat(v)); // numeric (defensivo)
- Sin esto, COUNT(\*) y todo bigint vuelven como string y rompen comparaciones (n > 0) y aritmética. Los precios se guardan como double precision (→ number JS), así los as number existentes siguen válidos.
- Adaptador execute/batch con el conversor ?→$n y los logs [PERF] actuales.
- Mantener toPlain() tal cual.

2.  db/schema_postgres.sql — nuevo (reemplaza schema.sql + migraciones 001–004)

Traducir el esquema completo con estas reglas:

┌────────────────────────────────────────┬─────────────────────────────────────────────────────┐ │ SQLite │ PostgreSQL │ ├────────────────────────────────────────┼─────────────────────────────────────────────────────┤ │ │ INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY │ │ INTEGER PRIMARY KEY AUTOINCREMENT │ KEY (permite insertar id explícito en la migración │ │ │ de datos) │ ├────────────────────────────────────────┼─────────────────────────────────────────────────────┤ │ REAL (precio*lista, precio_compra, │ DOUBLE PRECISION (devuelve number en JS, evita el │ │ importe, descuento, snap*\*) │ trap de numeric→string) │ ├────────────────────────────────────────┼─────────────────────────────────────────────────────┤ │ INTEGER booleano (activo, │ se dejan INTEGER (el código pasa 1/0 y compara = 1; │ │ excluida_actualizacion) │ cambiar a BOOLEAN implicaría tocar código │ │ │ innecesariamente) │ ├────────────────────────────────────────┼─────────────────────────────────────────────────────┤ │ TEXT (ids, códigos, nombres) │ TEXT │ ├────────────────────────────────────────┼─────────────────────────────────────────────────────┤ │ reset_at INTEGER (rate_limits, epoch │ BIGINT │ │ ms) │ │ ├────────────────────────────────────────┼─────────────────────────────────────────────────────┤ │ DEFAULT (datetime('now')) │ DEFAULT now_text() (helper, ver abajo) │ ├────────────────────────────────────────┼─────────────────────────────────────────────────────┤ │ CHECK (...), PK compuestas, UNIQUE, │ idénticos, se preservan │ │ FKs ON DELETE CASCADE/SET NULL │ │ └────────────────────────────────────────┴─────────────────────────────────────────────────────┘

Helper para replicar el formato exacto de SQLite (YYYY-MM-DD HH:MM:SS, UTC): CREATE OR REPLACE FUNCTION now_text() RETURNS text LANGUAGE sql AS $$ SELECT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD HH24:MI:SS');

$$
;
Columnas IDENTITY a portar: vendedores.id, sync_log.id, lotes.id,
lote_lineas.id, ventas.id.
Incluir todos los índices del schema base + migración 001/003 + 004
(idx_variantes_antigedad, idx_ventas_fecha_producto) y los seeds de modules
(incluido el módulo "Análisis" de la migración 001).

 3. SQL de dialecto dentro de queries/acciones (solo el TEXTO, misma interfaz)

 Archivos: src/lib/queries/analisis.ts, src/lib/queries/unicos.ts,
src/lib/actions/{confirmaciones,descuentos,imagenes,utils,upload,tiendas,permisos}.ts,
src/lib/auth.ts. Conversiones:

 ┌──────────────────────────┬─────────────────────┬────────────────────────────────────────────┐
│          SQLite          │     PostgreSQL      │                    Nota                    │
├──────────────────────────┼─────────────────────┼────────────────────────────────────────────┤
│ datetime('now')          │ now_text()          │ 12 usos                                    │
├──────────────────────────┼─────────────────────┼────────────────────────────────────────────┤
│ julianday('now') -       │ (CURRENT_DATE -     │ Haiku lo puso mal (EXTRACT(DAY FROM        │
│ julianday(x)             │ x::date)            │ date-date) falla: date−date ya es entero). │
│                          │                     │  analisis.ts:88,90; unicos.ts:31           │
├──────────────────────────┼─────────────────────┼────────────────────────────────────────────┤
│ julianday(a) -           │ (a::date - b::date) │ analisis.ts:57–58,79–80 (dentro de         │
│ julianday(b)             │                     │ AVG/ROUND)                                 │
├──────────────────────────┼─────────────────────┼────────────────────────────────────────────┤
│ ... >= date('now','-90   │ x::date >=          │                                            │
│ days')                   │ CURRENT_DATE -      │ analisis.ts:77                             │
│                          │ INTERVAL '90 days'  │                                            │
├──────────────────────────┼─────────────────────┼────────────────────────────────────────────┤
│ substr(x,1,7)            │ substr(x,1,7)       │ sin cambio (PG lo soporta)                 │
├──────────────────────────┼─────────────────────┼────────────────────────────────────────────┤
│ INSERT OR IGNORE INTO t  │ INSERT INTO t ...   │ auth, descuentos, upload, tiendas,         │
│ ...                      │ ON CONFLICT DO      │ permisos                                   │
│                          │ NOTHING             │                                            │
├──────────────────────────┼─────────────────────┼────────────────────────────────────────────┤
│ ON CONFLICT(col) DO      │ sin cambio          │ rate-limit, descuentos, imagenes, utils,   │
│ UPDATE SET ...           │ (sintaxis PG        │ upload                                     │
│ excluded.x               │ idéntica)           │                                            │
├──────────────────────────┼─────────────────────┼────────────────────────────────────────────┤
│ CAST(x AS INTEGER),      │                     │                                            │
│ ROUND, COALESCE,         │ sin cambio          │ ya compatibles                             │
│ RETURNING id, LIMIT      │                     │                                            │
└──────────────────────────┴─────────────────────┴────────────────────────────────────────────┘

 ▎ Los 3 result.rowsAffected (confirmaciones.ts:50,102; upload.ts:136) no se tocan:
▎ el adaptador ya expone rowsAffected.

 4. apply-migration.mjs — reescribir para pg

 - Usar pg.Client/Pool con DATABASE_URL.
- Ejecutar el archivo entero en un solo client.query(sql) (NO hacer split(";"):
el $$ … $$ de now_text() rompe el splitter ingenuo). El protocolo simple de pg
admite múltiples sentencias en una llamada.
- Quitar DATABASE_AUTH_TOKEN.

 5. migrate-data.mjs — nuevo (copia única Turso → Neon)

 Haiku omitió esto; hay que preservar datos históricos. Script one-off que abre
ambas conexiones (libSQL para leer, pg para escribir) y copia por lotes en orden de FK:
tiendas → users → modules → admin_modules → vendedores → producto_imagenes → productos → variantes
→ ventas → lotes → lote_lineas → lote_exclusiones → confirmaciones → sync_log → rate_limits.
- productos/variantes son opcionales (el upload diario los repuebla) pero conviene
copiarlos para que la app funcione de inmediato.
- Tras copiar tablas con IDENTITY, resetear las secuencias:
SELECT setval(pg_get_serial_sequence('ventas','id'), COALESCE((SELECT MAX(id) FROM ventas),1));
(repetir para vendedores, sync_log, lotes, lote_lineas).

 6. Dependencias y entorno

 - package.json: quitar @libsql/client, agregar pg (+ @types/pg dev). El adaptador
requiere DATABASE_AUTH_TOKEN solo temporalmente en migrate-data.mjs (lee de Turso).
- .env.local: DATABASE_URL = connection string pooled de Neon
(...-pooler.<region>.aws.neon.tech/...?sslmode=require). Eliminar DATABASE_AUTH_TOKEN
(salvo mientras corre la migración de datos).
- Vercel → Settings → Environment Variables: actualizar DATABASE_URL, borrar
DATABASE_AUTH_TOKEN, redeploy.

 7. (Opcional, diferido) Precómputo diario

 La query de rotación (antigüedad/cobertura) solo cambia tras el upload. Aunque en Postgres
ya será rápida, dejarla precomputada en una tabla resumen al final de finalizeUpload()
(src/lib/actions/upload.ts) la vuelve instantánea para siempre. No es necesario para
esta migración; se evalúa después si hiciera falta.

 ---
Orden de ejecución

 1. Crear proyecto en Neon (PG 16, us-east-1) y copiar el connection string pooled.
2. Escribir db/schema_postgres.sql y aplicarlo con el apply-migration.mjs nuevo.
3. Reescribir src/lib/db.ts (pg + adaptador + type parsers).
4. Convertir el SQL de dialecto en queries/acciones (tabla §3).
5. Correr migrate-data.mjs (Turso → Neon) y resetear secuencias.
6. .env.local → DATABASE_URL de Neon; npm run dev y probar en local contra Neon.
7. Actualizar env en Vercel y desplegar.
8. Quitar @libsql/client, DATABASE_AUTH_TOKEN y migrate-data.mjs una vez validado.

 ---
Verificación

 - Rendimiento: abrir /admin/analisis y /admin/actualizacion; los logs
[PERF][...] total deben marcar cientos de ms, no segundos. Sin sync inicial.
- Datos: contar filas en Neon vs Turso para ventas, users, tiendas, lotes,
confirmaciones — deben coincidir.
- Escrituras/transacciones: correr un upload de stock (borra + reinserta vía
db.batch → transacción) y verificar productos/variantes repoblados; crear/publicar
un lote de descuentos (usa RETURNING id, ON CONFLICT, batch).
- Auth y rate-limit: login (seedAdmin con INSERT ... ON CONFLICT DO NOTHING),
y forzar el rate-limit (upsert en rate_limits).
- Tipos: confirmar que COUNT(*) llega como number (KPIs, hasVentas) y que precios
son numbers (no strings) en Productos/Análisis.
- Regla del repo: antes de escribir código, revisar node_modules/next/dist/docs/
por cambios de esta versión de Next 16 que afecten server components / caché
(revalidatePath ya se usa y no cambia con la migración).
$$
