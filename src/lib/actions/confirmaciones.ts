"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import type { ActionResult } from "@/types";

// Un vendedor sin tienda asociada (tienda_id IS NULL) es una credencial global:
// válida para confirmar/rechazar en cualquier tienda. Uno con tienda asignada
// sigue restringido a esa tienda únicamente.
async function resolveVendedor(
  codigoVendedor: string,
  tiendaId: string
): Promise<{ id: number } | null> {
  const result = await db.execute({
    sql: `SELECT id FROM vendedores
          WHERE codigo = ? AND activo = 1 AND (tienda_id = ? OR tienda_id IS NULL)
          LIMIT 1`,
    args: [codigoVendedor.trim().toUpperCase(), tiendaId],
  });
  if (!result.rows.length) return null;
  return { id: result.rows[0].id as number };
}

export async function confirmarAplicacion(
  codigoVendedor: string,
  ids: number[]
): Promise<ActionResult<{ actualizados: number }>> {
  try {
    const session = await requireRole("client");
    if (!session.tienda_id)
      return { success: false, msg: "Tu usuario no tiene tienda asignada." };
    if (ids.length === 0) return { success: false, msg: "Selecciona al menos un producto." };
    if (!codigoVendedor.trim())
      return { success: false, msg: "Ingresa el código de vendedor." };

    const vendedor = await resolveVendedor(codigoVendedor, session.tienda_id);
    if (!vendedor)
      return {
        success: false,
        msg: "Código de vendedor no encontrado o inactivo en esta tienda.",
      };

    const placeholders = ids.map(() => "?").join(",");
    const result = await db.execute({
      sql: `UPDATE confirmaciones
            SET estado='confirmado', resuelto_at=now_text(),
                vendedor_id=?, codigo_usado=?
            WHERE id IN (${placeholders})
              AND tienda_id=?
              AND estado='pendiente'`,
      args: [vendedor.id, codigoVendedor.trim().toUpperCase(), ...ids, session.tienda_id],
    });

    const actualizados = result.rowsAffected;
    revalidatePath("/client/actualizacion");
    revalidatePath("/admin/actualizacion");
    return {
      success: true,
      msg: `${actualizados} producto(s) confirmado(s).`,
      data: { actualizados },
    };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}

export async function rechazarProductos(
  codigoVendedor: string,
  motivo: string,
  ids: number[]
): Promise<ActionResult<{ actualizados: number }>> {
  try {
    const session = await requireRole("client");
    if (!session.tienda_id)
      return { success: false, msg: "Tu usuario no tiene tienda asignada." };
    if (ids.length === 0) return { success: false, msg: "Selecciona al menos un producto." };
    if (!codigoVendedor.trim())
      return { success: false, msg: "Ingresa el código de vendedor." };
    if (!motivo.trim())
      return { success: false, msg: "Ingresa el motivo del rechazo." };

    const vendedor = await resolveVendedor(codigoVendedor, session.tienda_id);
    if (!vendedor)
      return {
        success: false,
        msg: "Código de vendedor no encontrado o inactivo en esta tienda.",
      };

    const placeholders = ids.map(() => "?").join(",");
    const result = await db.execute({
      sql: `UPDATE confirmaciones
            SET estado='rechazado', resuelto_at=now_text(),
                vendedor_id=?, codigo_usado=?, motivo_rechazo=?
            WHERE id IN (${placeholders})
              AND tienda_id=?
              AND estado='pendiente'`,
      args: [
        vendedor.id,
        codigoVendedor.trim().toUpperCase(),
        motivo.trim(),
        ...ids,
        session.tienda_id,
      ],
    });

    const actualizados = result.rowsAffected;
    revalidatePath("/client/actualizacion");
    revalidatePath("/admin/actualizacion");
    return {
      success: true,
      msg: `${actualizados} producto(s) rechazado(s).`,
      data: { actualizados },
    };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}
