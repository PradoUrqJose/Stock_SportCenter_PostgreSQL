// Copia a la base de PRODUCCIÓN los datos del módulo Marketing que ya se probaron en desarrollo:
//   mk_imagenes (las 3.573 imágenes), mk_plantillas, mk_paginas_fijas (con sus zonas clicables) y mk_enlaces.
// NO copia catálogos, versiones ni historial (son pruebas) y NO toca ninguna tabla del sistema STOCK.
// Los archivos de esas imágenes y diseños ya están en el bucket de R2 (es el mismo para desarrollo y producción).
//
// Seguro por defecto: sin `--aplicar` solo muestra qué haría (vista previa). Con `--aplicar` inserta lo que falta
// (ON CONFLICT DO NOTHING: no pisa nada que producción ya tenga) y avisa qué había de más allá en producción.
// Requiere las migraciones de db/migrations/marketing_todo.sql ya aplicadas en producción.
//
// Uso (desde la raíz de STOCK_SC; las dos direcciones son secretos: no las pegues en ningún chat):
//   ORIGEN="<DATABASE_URL de desarrollo>" DESTINO="<DATABASE_URL de producción>" node scripts/marketing-copiar-a-produccion.mjs
//   ORIGEN=… DESTINO=… node scripts/marketing-copiar-a-produccion.mjs --aplicar
// (ORIGEN puede omitirse: por defecto usa DATABASE_URL de .env.local si lo cargas con --env-file.)
import pg from "pg";

const aplicar = process.argv.includes("--aplicar");
const origenUrl = process.env.ORIGEN ?? process.env.DATABASE_URL;
const destinoUrl = process.env.DESTINO;
if (!origenUrl || !destinoUrl) {
  console.error("Faltan ORIGEN y DESTINO (direcciones de las bases). Mira el encabezado de este archivo.");
  process.exit(1);
}
const host = (u) => new URL(u).host.replace(/^[^.]+\./, "*.");
if (origenUrl === destinoUrl) {
  console.error("ORIGEN y DESTINO son la misma base: no hay nada que copiar.");
  process.exit(1);
}

// Tablas en orden (ninguna depende de otra de esta lista). Las columnas que apuntan a usuarios se dejan en NULL: en
// producción esos usuarios pueden ser otros y la relación no es necesaria.
const TABLAS = [
  { nombre: "mk_imagenes", clave: ["cod_universal"], nulos: ["updated_by"] },
  { nombre: "mk_plantillas", clave: ["id"], nulos: ["created_by"] },
  { nombre: "mk_paginas_fijas", clave: ["id"], nulos: [] },
  { nombre: "mk_enlaces", clave: ["clave"], nulos: [] },
];

const ssl = { rejectUnauthorized: false };
const o = new pg.Client({ connectionString: origenUrl, ssl });
const d = new pg.Client({ connectionString: destinoUrl, ssl });
await o.connect();
await d.connect();
try {
  console.log(`Origen : ${host(origenUrl)}\nDestino: ${host(destinoUrl)}\nModo   : ${aplicar ? "APLICAR (escribe en el destino)" : "vista previa (no escribe nada)"}\n`);
  // Comprobación: el destino ya debe tener las tablas (migraciones aplicadas).
  for (const t of TABLAS) {
    const r = await d.query("SELECT to_regclass($1) AS t", [t.nombre]);
    if (!r.rows[0].t) throw new Error(`En el destino falta la tabla ${t.nombre}: aplica primero db/migrations/marketing_todo.sql`);
  }

  if (aplicar) await d.query("BEGIN");
  for (const t of TABLAS) {
    const filas = (await o.query(`SELECT * FROM ${t.nombre}`)).rows;
    const existentes = Number((await d.query(`SELECT COUNT(*) AS n FROM ${t.nombre}`)).rows[0].n);
    let nuevas = 0;
    for (let i = 0; i < filas.length; i += 400) {
      const lote = filas.slice(i, i + 400);
      const columnas = Object.keys(lote[0]);
      const valores = [];
      const marcas = lote.map((f, k) => {
        const ph = columnas.map((c, j) => {
          valores.push(t.nulos.includes(c) ? null : f[c]);
          return `$${k * columnas.length + j + 1}`;
        });
        return `(${ph.join(",")})`;
      });
      const sql = `INSERT INTO ${t.nombre} (${columnas.join(",")}) VALUES ${marcas.join(",")} ON CONFLICT (${t.clave.join(",")}) DO NOTHING`;
      if (aplicar) nuevas += (await d.query(sql, valores)).rowCount ?? 0;
    }
    if (!aplicar) {
      // Vista previa: cuántas filas del origen no están todavía en el destino.
      const claves = filas.map((f) => f[t.clave[0]]);
      const ya = Number((await d.query(`SELECT COUNT(*) AS n FROM ${t.nombre} WHERE ${t.clave[0]} = ANY($1)`, [claves])).rows[0].n);
      nuevas = filas.length - ya;
    }
    console.log(`${t.nombre.padEnd(18)} origen ${String(filas.length).padStart(5)} · en destino ${String(existentes).padStart(5)} · ${aplicar ? "insertadas" : "se insertarían"} ${String(nuevas).padStart(5)}`);
  }
  if (aplicar) await d.query("COMMIT");
  console.log(aplicar ? "\nListo. Comprueba en el sistema: Marketing → Imágenes y Diseños." : "\nVista previa terminada. Si todo está bien, repite con --aplicar.");
} catch (e) {
  if (aplicar) await d.query("ROLLBACK").catch(() => {});
  console.error("\nERROR:", e.message, "\nNo se escribió nada.");
  process.exitCode = 1;
} finally {
  await o.end();
  await d.end();
}
