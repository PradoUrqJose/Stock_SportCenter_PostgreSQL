"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import type { ActionResult } from "@/types";
import type {
  ImagenInsert, ProductoInsert, VarianteInsert, VentaInsert,
  FacturacionInsert, IngresoInsert,
} from "@/lib/upload/types";

const CHUNK = 2000;

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

// Un único INSERT multi-fila por chunk en vez de una sentencia por fila: con
// Neon (Postgres remoto), cada round-trip pesa varias decenas de ms — insertar
// 2000 filas una por una dentro de una transacción puede tardar minutos y
// excede el timeout de la función serverless. Un solo INSERT con VALUES
// (...),(...),... resuelve el chunk completo en un round-trip.
function buildBulkInsert(
  table: string,
  columns: string[],
  rows: unknown[][],
  onConflict = ""
): { sql: string; args: unknown[] } {
  const args: unknown[] = [];
  const values = rows
    .map((row) => `(${row.map((v) => `$${args.push(v)}`).join(",")})`)
    .join(",");
  return {
    sql: `INSERT INTO ${table} (${columns.join(",")}) VALUES ${values} ${onConflict}`,
    args,
  };
}

export async function initUpload(): Promise<ActionResult> {
  try {
    await requireRole("admin", "administrador_general");
    await db.batch(
      [
        { sql: "DELETE FROM variantes", args: [] },
        { sql: "DELETE FROM productos", args: [] },
        { sql: "DELETE FROM producto_imagenes WHERE source = 'archivo'", args: [] },
      ],
      "write"
    );
    return { success: true, msg: "Espejo limpiado" };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}

export async function uploadProductosBatch(rows: ProductoInsert[]): Promise<ActionResult> {
  try {
    await requireRole("admin", "administrador_general");
    for (const chunk of chunks(rows, CHUNK)) {
      const { sql, args } = buildBulkInsert(
        "productos",
        ["cod_universal", "genero", "marca", "modelo", "categoria", "grupo", "color", "precio_lista", "descuento", "stock_total"],
        chunk.map((r) => [
          r.cod_universal, r.genero, r.marca, r.modelo,
          r.categoria, r.grupo, r.color,
          r.precio_lista, r.descuento, r.stock_total,
        ])
      );
      await db.execute({ sql, args });
    }
    return { success: true, msg: `${rows.length} productos insertados` };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}

export async function uploadVariantesBatch(rows: VarianteInsert[]): Promise<ActionResult> {
  try {
    await requireRole("admin", "administrador_general");
    for (const chunk of chunks(rows, CHUNK)) {
      const { sql, args } = buildBulkInsert(
        "variantes",
        ["cod_barras", "cod_universal", "genero", "talla", "alm_izq", "alm_der", "cod_prod", "precio_compra", "ingreso_fecha"],
        chunk.map((r) => [
          r.cod_barras, r.cod_universal, r.genero, r.talla,
          r.alm_izq, r.alm_der, r.cod_prod,
          r.precio_compra, r.ingreso_fecha,
        ]),
        "ON CONFLICT DO NOTHING"
      );
      await db.execute({ sql, args });
    }
    return { success: true, msg: `${rows.length} variantes insertadas` };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}

export async function uploadImagenesBatch(rows: ImagenInsert[]): Promise<ActionResult> {
  try {
    await requireRole("admin", "administrador_general");
    for (const chunk of chunks(rows, CHUNK)) {
      const { sql, args } = buildBulkInsert(
        "producto_imagenes",
        ["cod_universal", "imagen_url", "source"],
        chunk.map((img) => [img.cod_universal, img.imagen_url, "archivo"]),
        `ON CONFLICT (cod_universal)
         DO UPDATE SET imagen_url = excluded.imagen_url, updated_at = now_text()`
      );
      await db.execute({ sql, args });
    }
    return { success: true, msg: `${rows.length} imágenes insertadas` };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}

export async function clearVentas(): Promise<ActionResult> {
  try {
    await requireRole("admin", "administrador_general");
    await db.execute({ sql: "DELETE FROM ventas", args: [] });
    return { success: true, msg: "Ventas limpiadas" };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}

// Append incremental. ON CONFLICT DO NOTHING deduplica por cod_barras (unidad ya cargada).
// Devuelve cuántas filas eran nuevas (rowsAffected suma solo inserciones reales).
export async function uploadVentasBatch(
  rows: VentaInsert[]
): Promise<ActionResult<{ insertadas: number }>> {
  try {
    await requireRole("admin", "administrador_general");
    let insertadas = 0;
    for (const chunk of chunks(rows, CHUNK)) {
      const { sql, args } = buildBulkInsert(
        "ventas",
        ["cod_barras", "cod_universal", "genero", "fecha_venta", "ingreso_fecha", "almacen",
         "marca", "modelo", "categoria", "grupo", "color", "talla", "precio_compra", "precio_lista", "importe"],
        chunk.map((r) => [
          r.cod_barras, r.cod_universal, r.genero, r.fecha_venta, r.ingreso_fecha, r.almacen,
          r.marca, r.modelo, r.categoria, r.grupo, r.color, r.talla,
          r.precio_compra, r.precio_lista, r.importe,
        ]),
        "ON CONFLICT DO NOTHING"
      );
      const res = await db.execute({ sql, args });
      insertadas += res.rowsAffected ?? 0;
    }
    return { success: true, msg: `${insertadas} ventas nuevas`, data: { insertadas } };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}

export async function finalizeVentasUpload(
  totalFilas: number
): Promise<ActionResult<{ total: number }>> {
  try {
    const session = await requireRole("admin", "administrador_general");
    // Fallback best-effort: rellena cod_universal/genero desde variantes solo si el
    // archivo no los trajo (la unidad podría seguir en stock por re-ingreso).
    await db.execute({
      sql: `UPDATE ventas
            SET cod_universal = (SELECT cod_universal FROM variantes WHERE variantes.cod_barras = ventas.cod_barras LIMIT 1),
                genero        = (SELECT genero        FROM variantes WHERE variantes.cod_barras = ventas.cod_barras LIMIT 1)
            WHERE cod_universal IS NULL`,
      args: [],
    });
    await db.execute({
      sql: `INSERT INTO sync_log (tipo, filas, ejecutado_by) VALUES ('ventas', ?, ?)`,
      args: [totalFilas, session.id],
    });
    const totalRes = await db.execute(`SELECT COUNT(*) AS n FROM ventas`);
    const total = (totalRes.rows[0].n as number) ?? 0;
    revalidatePath("/admin");
    revalidatePath("/admin/actualizacion");
    revalidatePath("/admin/analisis");
    return { success: true, msg: "Import de ventas registrado", data: { total } };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}

export async function finalizeUpload(totalFilas: number): Promise<ActionResult> {
  try {
    const session = await requireRole("admin", "administrador_general");
    await db.execute({
      sql: `INSERT INTO sync_log (tipo, filas, ejecutado_by) VALUES ('stock', ?, ?)`,
      args: [totalFilas, session.id],
    });
    revalidatePath("/admin/productos");
    revalidatePath("/admin/actualizacion");
    revalidatePath("/client/actualizacion");
    return { success: true, msg: "Upload registrado" };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}

// ON CONFLICT DO NOTHING deduplica por ser_num (clave de documento, igual en
// el histórico y en lo que trae el scraper) — permite recargar el histórico
// completo aunque se solape con datos ya sincronizados desde el ERP.
export async function uploadFacturacionBatch(
  rows: FacturacionInsert[]
): Promise<ActionResult<{ insertadas: number }>> {
  try {
    await requireRole("admin", "administrador_general");
    let insertadas = 0;
    for (const chunk of chunks(rows, CHUNK)) {
      const { sql, args } = buildBulkInsert(
        "facturacion",
        ["ser_num", "codigo", "tienda", "tipo_comprobante", "cliente", "mayorista", "fecha",
         "moneda", "subtotal", "dscto", "not_cre", "bi", "igv", "total",
         "efectivo", "tarjeta", "transferencia", "detalle_tarjeta", "vendedor", "nc", "fuente"],
        chunk.map((r) => [
          r.ser_num, r.codigo, r.tienda, r.tipo_comprobante, r.cliente, r.mayorista, r.fecha,
          r.moneda, r.subtotal, r.dscto, r.not_cre, r.bi, r.igv, r.total,
          r.efectivo, r.tarjeta, r.transferencia, r.detalle_tarjeta, r.vendedor, r.nc, r.fuente,
        ]),
        "ON CONFLICT (ser_num) DO NOTHING"
      );
      const res = await db.execute({ sql, args });
      insertadas += res.rowsAffected ?? 0;
    }
    return { success: true, msg: `${insertadas} facturas nuevas`, data: { insertadas } };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}

export async function finalizeFacturacionUpload(
  totalFilas: number
): Promise<ActionResult<{ total: number }>> {
  try {
    const session = await requireRole("admin", "administrador_general");
    await db.execute({
      sql: `INSERT INTO sync_log (tipo, filas, ejecutado_by) VALUES ('facturacion', ?, ?)`,
      args: [totalFilas, session.id],
    });
    const totalRes = await db.execute(`SELECT COUNT(*) AS n FROM facturacion`);
    const total = (totalRes.rows[0].n as number) ?? 0;
    revalidatePath("/admin/facturacion");
    return { success: true, msg: "Import de facturación registrado", data: { total } };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}

// ON CONFLICT DO NOTHING deduplica por codigo_interno, mismo motivo que en facturación.
export async function uploadIngresosBatch(
  rows: IngresoInsert[]
): Promise<ActionResult<{ insertadas: number }>> {
  try {
    await requireRole("admin", "administrador_general");
    let insertadas = 0;
    for (const chunk of chunks(rows, CHUNK)) {
      const { sql, args } = buildBulkInsert(
        "ingresos",
        ["codigo_interno", "emp", "almacen", "ing_sal", "tipo_mov", "serie_numero", "emision",
         "moneda", "importe", "subtotal", "igv", "dscto", "total",
         "ruc", "proveedor", "cmpl", "mcdr", "ord_compra", "fuente"],
        chunk.map((r) => [
          r.codigo_interno, r.emp, r.almacen, r.ing_sal, r.tipo_mov, r.serie_numero, r.emision,
          r.moneda, r.importe, r.subtotal, r.igv, r.dscto, r.total,
          r.ruc, r.proveedor, r.cmpl, r.mcdr, r.ord_compra, r.fuente,
        ]),
        "ON CONFLICT (codigo_interno) DO NOTHING"
      );
      const res = await db.execute({ sql, args });
      insertadas += res.rowsAffected ?? 0;
    }
    return { success: true, msg: `${insertadas} ingresos nuevos`, data: { insertadas } };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}

export async function finalizeIngresosUpload(
  totalFilas: number
): Promise<ActionResult<{ total: number }>> {
  try {
    const session = await requireRole("admin", "administrador_general");
    await db.execute({
      sql: `INSERT INTO sync_log (tipo, filas, ejecutado_by) VALUES ('ingresos', ?, ?)`,
      args: [totalFilas, session.id],
    });
    const totalRes = await db.execute(`SELECT COUNT(*) AS n FROM ingresos`);
    const total = (totalRes.rows[0].n as number) ?? 0;
    revalidatePath("/admin/ingresos");
    return { success: true, msg: "Import de ingresos registrado", data: { total } };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}
