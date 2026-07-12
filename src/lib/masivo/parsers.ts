import * as XLSX from "xlsx";

export type ImagenMasivoRow = { cod_universal: string; imagen_url: string };
export type DescuentoMasivoRow = { cod_universal: string; descuento: number };
export type VendedorMasivoRow = { usuario: string; nombre: string; codigo: string; activo: boolean };

function readAsBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as ArrayBuffer);
    r.onerror = () => rej(r.error);
    r.readAsArrayBuffer(file);
  });
}

function normHeader(s: string) {
  return s.replace(/[\s._]+/g, "").toUpperCase();
}

function findCol(headers: string[], patterns: string[]): string | undefined {
  return headers.find((h) => patterns.some((p) => normHeader(h).includes(p)));
}

async function readSheet(file: File): Promise<Record<string, unknown>[]> {
  const buf = await readAsBuffer(file);
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
}

function str(val: unknown): string | null {
  if (val == null || val === "") return null;
  return String(val).trim().toUpperCase();
}

export async function parseImagenesMasivoFile(file: File): Promise<ImagenMasivoRow[]> {
  const rows = await readSheet(file);
  if (rows.length === 0) throw new Error("El archivo no tiene filas.");
  const headers = Object.keys(rows[0]);

  const colCod = findCol(headers, ["CODE"]);
  const colUrl = findCol(headers, ["ENLACE"]);
  if (!colCod) throw new Error("No se encontró la columna 'CODE'.");
  if (!colUrl) throw new Error("No se encontró la columna 'ENLACE'.");

  const map = new Map<string, string>();
  for (const row of rows) {
    const cod = str(row[colCod]);
    const url = row[colUrl] == null ? null : String(row[colUrl]).trim();
    if (!cod || !url) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    map.set(cod, url);
  }
  return Array.from(map, ([cod_universal, imagen_url]) => ({ cod_universal, imagen_url }));
}

export async function parseVendedoresMasivoFile(file: File): Promise<VendedorMasivoRow[]> {
  const rows = await readSheet(file);
  if (rows.length === 0) throw new Error("El archivo no tiene filas.");
  const headers = Object.keys(rows[0]);

  const colUsuario = findCol(headers, ["USUARIO"]);
  const colNombre = findCol(headers, ["NOMBRE"]);
  const colCodigo = findCol(headers, ["CREDENCIAL", "CODIGO"]);
  const colActivo = findCol(headers, ["ACTIVO", "ESTADO"]);
  if (!colUsuario) throw new Error("No se encontró la columna 'Usuario'.");
  if (!colNombre) throw new Error("No se encontró la columna 'Nombre'.");
  if (!colCodigo) throw new Error("No se encontró la columna 'Credencial'.");

  const map = new Map<string, VendedorMasivoRow>(); // dedupe por código, se queda con el último
  for (const row of rows) {
    const usuarioRaw = row[colUsuario];
    const usuario = usuarioRaw == null ? "" : String(usuarioRaw).trim();
    const nombreRaw = row[colNombre];
    const nombre = nombreRaw == null ? "" : String(nombreRaw).trim();
    const codigo = str(row[colCodigo]);
    if (!usuario || !nombre || !codigo) continue;

    // Columna Activo/Estado es opcional: "INACTIVO" desactiva, cualquier otro
    // valor (o ausencia de la columna) crea el vendedor activo por defecto.
    const activoRaw = colActivo ? str(row[colActivo]) : null;
    const activo = activoRaw !== "INACTIVO";

    map.set(codigo, { usuario, nombre, codigo, activo });
  }
  return Array.from(map.values());
}

export async function parseDescuentosMasivoFile(file: File): Promise<DescuentoMasivoRow[]> {
  const rows = await readSheet(file);
  if (rows.length === 0) throw new Error("El archivo no tiene filas.");
  const headers = Object.keys(rows[0]);

  const colCod = findCol(headers, ["CODIGOUNIVERSAL", "CODUNIVERSAL"]);
  const colDesc = findCol(headers, ["DESCUENTO", "DESC", "PORCENTAJE"]);
  if (!colCod) throw new Error("No se encontró la columna 'Código Universal'.");
  if (!colDesc) throw new Error("No se encontró la columna 'Descuento'.");

  const map = new Map<string, number>();
  for (const row of rows) {
    const cod = str(row[colCod]);
    if (!cod) continue;
    const raw = row[colDesc];
    if (raw == null || raw === "") continue;
    const n = Number(String(raw).replace("%", "").trim());
    if (isNaN(n)) continue;
    map.set(cod, n);
  }
  return Array.from(map, ([cod_universal, descuento]) => ({ cod_universal, descuento }));
}
