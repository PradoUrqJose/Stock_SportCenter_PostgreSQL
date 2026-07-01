"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import type { ActionResult } from "@/types";
import type { ImagenInsert, ProductoInsert, VarianteInsert, VentaInsert } from "@/lib/upload/types";

const CHUNK = 2000;

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
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
      await db.batch(
        chunk.map((r) => ({
          sql: `INSERT INTO productos
                  (cod_universal, genero, marca, modelo, categoria, grupo, color, precio_lista, descuento, stock_total)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            r.cod_universal, r.genero, r.marca, r.modelo,
            r.categoria, r.grupo, r.color,
            r.precio_lista, r.descuento, r.stock_total,
          ],
        })),
        "write"
      );
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
      await db.batch(
        chunk.map((r) => ({
          sql: `INSERT OR IGNORE INTO variantes
                  (cod_barras, cod_universal, genero, talla, alm_izq, alm_der, cod_prod, precio_compra, ingreso_fecha)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            r.cod_barras, r.cod_universal, r.genero, r.talla,
            r.alm_izq, r.alm_der, r.cod_prod,
            r.precio_compra, r.ingreso_fecha,
          ],
        })),
        "write"
      );
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
      await db.batch(
        chunk.map((img) => ({
          sql: `INSERT INTO producto_imagenes (cod_universal, imagen_url, source)
                VALUES (?, ?, 'archivo')
                ON CONFLICT (cod_universal)
                DO UPDATE SET imagen_url = excluded.imagen_url, updated_at = datetime('now')`,
          args: [img.cod_universal, img.imagen_url],
        })),
        "write"
      );
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

export async function uploadVentasBatch(rows: VentaInsert[]): Promise<ActionResult> {
  try {
    await requireRole("admin", "administrador_general");
    for (const chunk of chunks(rows, CHUNK)) {
      await db.batch(
        chunk.map((r) => ({
          sql: `INSERT INTO ventas (cod_barras, fecha_venta, cantidad, importe)
                VALUES (?, ?, ?, ?)`,
          args: [r.cod_barras, r.fecha_venta, r.cantidad, r.importe ?? null],
        })),
        "write"
      );
    }
    return { success: true, msg: `${rows.length} ventas insertadas` };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}

export async function finalizeVentasUpload(totalFilas: number): Promise<ActionResult> {
  try {
    const session = await requireRole("admin", "administrador_general");
    // Populate cod_universal + genero from variantes via barcode join
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
    revalidatePath("/admin");
    revalidatePath("/admin/actualizacion");
    return { success: true, msg: "Import de ventas registrado" };
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
