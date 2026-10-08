import * as XLSX from "xlsx";
import { getSession } from "@/lib/auth";
import { db, transaction } from "@/lib/db";
import { revalidatePath } from "next/cache";

export const maxDuration = 60;

const code = (v: unknown) => String(v ?? "").trim().toUpperCase();

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !["admin", "administrador_general"].includes(session.rol))
    return Response.json({ msg: "Sin permisos" }, { status: 403 });
  const allowed = await db.execute({ sql: `SELECT 1 FROM users u WHERE u.id=? AND u.activo=1
    AND (u.rol='administrador_general' OR (u.rol='admin' AND EXISTS
      (SELECT 1 FROM admin_modules am WHERE am.user_id=u.id AND am.module_id='productos')))`, args: [session.id] });
  if (!allowed.rows.length) return Response.json({ msg: "Sin permiso de Productos" }, { status: 403 });
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host"))
    return Response.json({ msg: "Origen no permitido" }, { status: 403 });
  try {
    const form = await req.formData();
    const file = form.get("archivo");
    if (!(file instanceof File) || !/\.xlsx$/i.test(file.name) || file.size > 15_000_000)
      return Response.json({ msg: "Selecciona un .xlsx de hasta 15 MB" }, { status: 400 });
    const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("El archivo no contiene hojas");
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const required = ["COD.BARRAS", "COD.UNIV.", "IZQ", "DER", "VEND", "OCUP"];
    if (!required.every((key) => rows[0] && key in rows[0]))
      throw new Error(`Faltan columnas: ${required.join(", ")}`);
    const seen = new Set<string>();
    const items: string[][] = [];
    const sedes = new Set<string>();
    for (const [index, row] of rows.entries()) {
      const barcode = code(row["COD.BARRAS"]);
      const left = code(row.IZQ);
      const right = code(row.DER);
      // El exportador ERP añade una línea de JavaScript al pie.
      if (!barcode && !left && !right && !code(row["COD.UNIV."])) continue;
      if (!barcode || !code(row["COD.UNIV."]) || !left || !right)
        throw new Error(`Fila ${index + 2}: falta código o ubicación`);
      if (code(row.VEND) !== "N" || !["N", "S"].includes(code(row.OCUP)))
        throw new Error(`Fila ${index + 2}: VEND u OCUP tiene un valor inesperado`);
      if (seen.has(barcode)) throw new Error(`Código de barras duplicado: ${barcode}`);
      seen.add(barcode);
      sedes.add(left);
      sedes.add(right);
      items.push([barcode, code(row["COD.UNIV."]), code(row.MARCA), code(row.MODELO), code(row.TALLA), code(row.GENERO), code(row.GRUPO), code(row.CATEGORIA), code(row.COLOR), left, right, code(row.OCUP) === "S" ? "true" : "false"]);
    }
    if (!items.length) throw new Error("El archivo no contiene stock");
    await transaction(async (query) => {
      await query("SELECT pg_advisory_xact_lock(hashtext('inventario_traslados'))");
      const previousCount = Number((await query("SELECT COUNT(*) AS n FROM inventario_completo")).rows[0]?.n ?? 0);
      if (previousCount > 0 && items.length < previousCount * 0.8 && form.get("confirmar_reduccion") !== "si")
        throw new Error(`La carga tiene ${items.length} códigos frente a ${previousCount} actuales. Marca la confirmación de reducción si el archivo está completo.`);
      const byBarcode = new Map(items.map((item) => [item[0], item]));
      const active = await query("SELECT cod_barras,origen,lado FROM traslado_partes WHERE estado<>'recibido'");
      for (const move of active.rows) {
        const item = byBarcode.get(String(move.cod_barras));
        if (!item || (move.lado === "izq" ? item[9] : item[10]) !== move.origen)
          throw new Error(`Carga detenida: el traslado activo de ${move.cod_barras} no coincide con el stock del Excel`);
      }
      const recent = await query(`SELECT t.cod_barras,COALESCE(e.lado,t.lado) AS lado,t.destino
        FROM traslados t JOIN traslado_eventos e ON e.traslado_id=t.id AND e.estado='recibido'
        WHERE e.creado_at > COALESCE((SELECT MAX(cargado_at) FROM inventario_cargas),'1970-01-01'::timestamptz)
        ORDER BY e.creado_at,e.id`);
      const expected = new Map<string, { izq?: string; der?: string }>();
      for (const move of recent.rows) {
        const key = String(move.cod_barras);
        const sides = expected.get(key) ?? {};
        if (move.lado !== "der") sides.izq = String(move.destino);
        if (move.lado !== "izq") sides.der = String(move.destino);
        expected.set(key, sides);
      }
      for (const [barcode, sides] of expected) {
        const item = byBarcode.get(barcode);
        if (item && ((sides.izq && item[9] !== sides.izq) || (sides.der && item[10] !== sides.der)))
          throw new Error(`Carga detenida: ${barcode} ya fue recepcionado; actualiza el Excel del ERP`);
      }
      await query("DELETE FROM inventario_completo");
      for (let i = 0; i < items.length; i += 500) {
        const batch = items.slice(i, i + 500);
        const args = batch.flat();
        const values = batch.map((_, j) => `(${Array.from({ length: 12 }, (_, k) => `$${j * 12 + k + 1}`).join(",")})`).join(",");
        await query({ sql: `INSERT INTO inventario_completo (cod_barras,cod_universal,marca,modelo,talla,genero,grupo,categoria,color,alm_izq,alm_der,ocupado) VALUES ${values}`, args });
      }
      // Las sedes del archivo quedan disponibles para crear perfiles; JAL se clasifica como almacén.
      for (const sede of sedes) {
        const tipo = /^T\d+$/i.test(sede) ? "tienda" : "almacen";
        await query({ sql: `INSERT INTO tiendas (id,nombre,tipo,excluida_actualizacion) VALUES (?,?,?,?) ON CONFLICT (nombre) DO NOTHING`, args: [crypto.randomUUID(), sede, tipo, tipo === "almacen" ? 1 : 0] });
      }
      await query({ sql: "INSERT INTO inventario_cargas (archivo,filas,cargado_by) VALUES (?,?,?)", args: [file.name, items.length, session.id] });
    });
    revalidatePath("/client/stock");
    revalidatePath("/admin/traslados");
    return Response.json({ msg: `${items.length} códigos cargados en ${sedes.size} sedes`, filas: items.length });
  } catch (e) {
    return Response.json({ msg: e instanceof Error ? e.message : "Error al cargar" }, { status: 400 });
  }
}
