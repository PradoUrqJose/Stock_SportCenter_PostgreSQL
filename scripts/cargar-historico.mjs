// Carga única de los archivos históricos (2021/2022-2026) de Facturación e
// Ingresos a Neon. Misma lógica de mapeo que src/lib/upload/parsers.ts,
// reescrita standalone en Node porque los parsers de la app son client-side
// (dependen de File/FileReader del navegador).
//
// Uso: node scripts/cargar-historico.mjs
import pg from "pg";
import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";

const DIR = "/Users/jpradou/Downloads/REPORTES";

function str(v) {
  if (v == null || v === "") return null;
  return String(v).trim().toUpperCase();
}
function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
function fecha(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  return null;
}

function leerHoja(archivo, hoja) {
  const wb = XLSX.read(readFileSync(`${DIR}/${archivo}`), { type: "buffer", cellDates: true });
  const ws = wb.Sheets[hoja ?? wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: null });
}

function facturacionRows() {
  const rows = leerHoja("FACTURACION.xlsx");
  return rows
    .map((r) => ({
      ser_num: str(r["SER-NUM"]),
      codigo: null,
      tienda: null,
      tipo_comprobante: str(r["COMPROBANTE"]),
      cliente: str(r["MINORISTA"]),
      mayorista: str(r["MAYORISTA"]),
      fecha: fecha(r["FECHA"]),
      moneda: null,
      subtotal: null, dscto: null, not_cre: null, bi: null, igv: null,
      total: num(r["TOTAL"]) ?? 0,
      efectivo: null, tarjeta: null, transferencia: null,
      detalle_tarjeta: null, vendedor: null, nc: null,
      fuente: "historico",
    }))
    .filter((r) => r.ser_num && r.fecha);
}

function ingresosRows() {
  const rows = leerHoja("INGRESOS.xlsx", "Hoja1");
  return rows
    .map((r) => ({
      codigo_interno: str(r["CODIGO"]),
      emp: str(r["EMP"]),
      almacen: str(r["ALM"]),
      ing_sal: str(r["ING/SAL"]),
      tipo_mov: str(r["TIPO MOV."]),
      serie_numero: str(r["N° DCTO"]),
      emision: fecha(r["EMISION"]),
      moneda: str(r["MONEDA"]),
      importe: num(r["IMPORTE"]),
      subtotal: null, igv: null, dscto: null, total: null,
      ruc: str(r["RUC"]),
      proveedor: str(r["PROVEEDOR"]),
      cmpl: null, mcdr: null, ord_compra: null,
      fuente: "historico",
    }))
    .filter((r) => r.codigo_interno && r.emision);
}

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildInsert(table, columns, rows, onConflict) {
  const args = [];
  const values = rows
    .map((row) => `(${row.map((v) => `$${args.push(v)}`).join(",")})`)
    .join(",");
  return { sql: `INSERT INTO ${table} (${columns.join(",")}) VALUES ${values} ${onConflict}`, args };
}

async function main() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const fact = facturacionRows();
  const ing = ingresosRows();
  console.log(`Facturación: ${fact.length} filas parseadas.`);
  console.log(`Ingresos: ${ing.length} filas parseadas.`);

  let factInsertadas = 0;
  const factCols = ["ser_num", "codigo", "tienda", "tipo_comprobante", "cliente", "mayorista", "fecha",
    "moneda", "subtotal", "dscto", "not_cre", "bi", "igv", "total",
    "efectivo", "tarjeta", "transferencia", "detalle_tarjeta", "vendedor", "nc", "fuente"];
  for (const chunk of chunks(fact, 500)) {
    const { sql, args } = buildInsert("facturacion", factCols,
      chunk.map((r) => factCols.map((c) => r[c])),
      "ON CONFLICT (ser_num) DO NOTHING");
    const res = await client.query(sql, args);
    factInsertadas += res.rowCount ?? 0;
  }
  console.log(`Facturación insertadas: ${factInsertadas} (nuevas, tras dedup).`);

  let ingInsertadas = 0;
  const ingCols = ["codigo_interno", "emp", "almacen", "ing_sal", "tipo_mov", "serie_numero", "emision",
    "moneda", "importe", "subtotal", "igv", "dscto", "total",
    "ruc", "proveedor", "cmpl", "mcdr", "ord_compra", "fuente"];
  for (const chunk of chunks(ing, 500)) {
    const { sql, args } = buildInsert("ingresos", ingCols,
      chunk.map((r) => ingCols.map((c) => r[c])),
      "ON CONFLICT (codigo_interno) DO NOTHING");
    const res = await client.query(sql, args);
    ingInsertadas += res.rowCount ?? 0;
  }
  console.log(`Ingresos insertados: ${ingInsertadas} (nuevos, tras dedup).`);

  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
