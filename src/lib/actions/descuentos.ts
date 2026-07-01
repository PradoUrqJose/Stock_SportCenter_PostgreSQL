"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import type { ActionResult } from "@/types";

export type LineaInput = {
  cod_universal: string;
  genero: string;
  descuento_nuevo: number;
};

const CHUNK = 500;

function confirmacionesFanoutStmt(loteId: number) {
  return {
    sql: `INSERT OR IGNORE INTO confirmaciones (lote_id, tienda_id, cod_universal, genero)
          SELECT DISTINCT ll.lote_id, t.id, ll.cod_universal, ll.genero
          FROM lote_lineas ll
          JOIN (
            SELECT cod_universal, genero, alm_izq AS alm FROM variantes WHERE alm_izq IS NOT NULL
            UNION
            SELECT cod_universal, genero, alm_der   FROM variantes WHERE alm_der  IS NOT NULL
          ) v ON v.cod_universal = ll.cod_universal AND v.genero = ll.genero
          JOIN tiendas t ON t.nombre = v.alm
          WHERE ll.lote_id = ?
            AND t.excluida_actualizacion = 0
            AND t.id NOT IN (SELECT tienda_id FROM lote_exclusiones WHERE lote_id = ?)`,
    args: [loteId, loteId],
  };
}

async function getOrCreateBorrador(userId: string): Promise<number> {
  const existing = await db.execute({
    sql: `SELECT id FROM lotes WHERE estado = 'borrador' ORDER BY id DESC LIMIT 1`,
    args: [],
  });

  if (existing.rows.length > 0) {
    return existing.rows[0].id as number;
  }

  const inserted = await db.execute({
    sql: `INSERT INTO lotes (created_by) VALUES (?) RETURNING id`,
    args: [userId],
  });
  return inserted.rows[0].id as number;
}

export async function guardarDescuentos(
  lineas: LineaInput[]
): Promise<ActionResult<{ loteId: number }>> {
  try {
    const session = await requireRole("admin", "administrador_general");
    if (lineas.length === 0) return { success: true, msg: "Sin cambios" };

    const loteId = await getOrCreateBorrador(session.id);

    for (let i = 0; i < lineas.length; i += CHUNK) {
      const chunk = lineas.slice(i, i + CHUNK);
      await db.batch(
        chunk.map((l) => ({
          sql: `INSERT INTO lote_lineas
                  (lote_id, cod_universal, genero, descuento_antes, descuento_nuevo,
                   snap_marca, snap_modelo, snap_categoria, snap_color,
                   snap_precio_lista, snap_precio_compra, editado_at)
                SELECT
                  ?, p.cod_universal, p.genero, p.descuento, ?,
                  p.marca, p.modelo, p.categoria, p.color, p.precio_lista,
                  (SELECT MIN(v.precio_compra) FROM variantes v
                   WHERE v.cod_universal = p.cod_universal AND v.genero = p.genero),
                  datetime('now')
                FROM productos p
                WHERE p.cod_universal = ? AND p.genero = ?
                ON CONFLICT (lote_id, cod_universal, genero) DO UPDATE SET
                  descuento_nuevo = excluded.descuento_nuevo,
                  editado_at      = excluded.editado_at`,
          args: [loteId, l.descuento_nuevo, l.cod_universal, l.genero],
        })),
        "write"
      );
    }

    revalidatePath("/admin/actualizacion");
    revalidatePath("/admin/actualizacion-updates");
    return {
      success: true,
      msg: `${lineas.length} línea(s) guardada(s) en borrador #${loteId}`,
      data: { loteId },
    };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}

export async function publicarLote(loteId: number): Promise<ActionResult> {
  try {
    const session = await requireRole("admin", "administrador_general");

    const loteRow = await db.execute({
      sql: `SELECT estado FROM lotes WHERE id = ?`,
      args: [loteId],
    });
    if (!loteRow.rows.length) return { success: false, msg: "Lote no encontrado." };
    if (loteRow.rows[0].estado !== "borrador")
      return { success: false, msg: "Solo se puede publicar un lote en estado borrador." };

    const otroPublicado = await db.execute({
      sql: `SELECT id FROM lotes WHERE estado = 'publicado' AND id != ? LIMIT 1`,
      args: [loteId],
    });
    if (otroPublicado.rows.length > 0) {
      const otroId = otroPublicado.rows[0].id as number;
      return {
        success: false,
        msg: `Ya hay un lote publicado (#${otroId}) esperando confirmaciones. Ciérralo antes de publicar este borrador.`,
      };
    }

    const lineasCount = await db.execute({
      sql: `SELECT COUNT(*) AS n FROM lote_lineas WHERE lote_id = ?`,
      args: [loteId],
    });
    if ((lineasCount.rows[0].n as number) === 0)
      return { success: false, msg: "El borrador no tiene líneas. Agrega descuentos antes de publicar." };

    await db.batch(
      [
        confirmacionesFanoutStmt(loteId),
        {
          sql: `UPDATE lotes SET estado='publicado', published_at=datetime('now'), published_by=? WHERE id=?`,
          args: [session.id, loteId],
        },
      ],
      "write"
    );

    revalidatePath("/admin");
    revalidatePath("/admin/actualizacion");
    revalidatePath("/admin/actualizacion-updates");
    revalidatePath("/client/actualizacion");
    return { success: true, msg: `Lote #${loteId} publicado.` };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}

export async function agregarLineasALotePublicado(
  loteId: number,
  lineas: LineaInput[]
): Promise<ActionResult<{ agregadas: number; omitidas: number; sinTienda: number }>> {
  try {
    await requireRole("admin", "administrador_general");
    if (lineas.length === 0)
      return { success: true, msg: "Sin cambios", data: { agregadas: 0, omitidas: 0, sinTienda: 0 } };

    const loteRow = await db.execute({
      sql: `SELECT estado FROM lotes WHERE id = ?`,
      args: [loteId],
    });
    if (!loteRow.rows.length) return { success: false, msg: "Lote no encontrado." };
    if (loteRow.rows[0].estado !== "publicado")
      return { success: false, msg: "Solo se puede agregar a un lote publicado." };

    const existing = await db.execute({
      sql: `SELECT cod_universal, genero FROM lote_lineas WHERE lote_id = ?`,
      args: [loteId],
    });
    const existingKeys = new Set(existing.rows.map((r) => `${r.cod_universal}|${r.genero}`));
    const nuevas = lineas.filter((l) => !existingKeys.has(`${l.cod_universal}|${l.genero}`));
    const omitidas = lineas.length - nuevas.length;

    if (nuevas.length > 0) {
      for (let i = 0; i < nuevas.length; i += CHUNK) {
        const chunk = nuevas.slice(i, i + CHUNK);
        await db.batch(
          chunk.map((l) => ({
            sql: `INSERT OR IGNORE INTO lote_lineas
                    (lote_id, cod_universal, genero, descuento_antes, descuento_nuevo,
                     snap_marca, snap_modelo, snap_categoria, snap_color,
                     snap_precio_lista, snap_precio_compra, editado_at)
                  SELECT
                    ?, p.cod_universal, p.genero, p.descuento, ?,
                    p.marca, p.modelo, p.categoria, p.color, p.precio_lista,
                    (SELECT MIN(v.precio_compra) FROM variantes v
                     WHERE v.cod_universal = p.cod_universal AND v.genero = p.genero),
                    datetime('now')
                  FROM productos p
                  WHERE p.cod_universal = ? AND p.genero = ?`,
            args: [loteId, l.descuento_nuevo, l.cod_universal, l.genero],
          })),
          "write"
        );
      }

      await db.execute(confirmacionesFanoutStmt(loteId));
    }

    // Líneas nuevas que no llegaron a generar ninguna confirmación (sin tienda con
    // stock no excluida) — quedarían invisibles en todo el panel de seguimiento.
    let sinTienda = 0;
    if (nuevas.length > 0) {
      const nuevasKeys = new Set(nuevas.map((l) => `${l.cod_universal}|${l.genero}`));
      const huerfanas = await db.execute({
        sql: `SELECT ll.cod_universal, ll.genero FROM lote_lineas ll
              WHERE ll.lote_id = ?
                AND NOT EXISTS (
                  SELECT 1 FROM confirmaciones c
                  WHERE c.lote_id = ll.lote_id AND c.cod_universal = ll.cod_universal AND c.genero = ll.genero
                )`,
        args: [loteId],
      });
      sinTienda = huerfanas.rows.filter((r) => nuevasKeys.has(`${r.cod_universal}|${r.genero}`)).length;
    }

    revalidatePath("/admin");
    revalidatePath("/admin/actualizacion");
    revalidatePath("/admin/actualizacion-updates");
    revalidatePath("/admin/reposicion");
    revalidatePath("/client/actualizacion");

    const partes = [`${nuevas.length} producto(s) agregado(s) al lote publicado #${loteId}.`];
    if (omitidas > 0) partes.push(`${omitidas} ya estaban incluidos.`);
    if (sinTienda > 0) partes.push(`${sinTienda} sin tiendas asociadas (no se generó confirmación).`);

    return {
      success: true,
      msg: partes.join(" "),
      data: { agregadas: nuevas.length, omitidas, sinTienda },
    };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}

export async function marcarResanado(loteId: number): Promise<ActionResult> {
  try {
    const session = await requireRole("admin", "administrador_general");

    const loteRow = await db.execute({
      sql: `SELECT estado FROM lotes WHERE id = ?`,
      args: [loteId],
    });
    if (!loteRow.rows.length) return { success: false, msg: "Lote no encontrado." };
    if (loteRow.rows[0].estado !== "cerrado")
      return { success: false, msg: "Solo se puede resanar un lote cerrado." };

    await db.execute({
      sql: `UPDATE lotes SET resanado_at=datetime('now'), resanado_by=? WHERE id=?`,
      args: [session.id, loteId],
    });

    revalidatePath("/admin/actualizacion");
    return { success: true, msg: `Lote #${loteId} marcado como resanado.` };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}

export async function cerrarLote(loteId: number): Promise<ActionResult> {
  try {
    const session = await requireRole("admin", "administrador_general");

    const loteRow = await db.execute({
      sql: `SELECT estado FROM lotes WHERE id = ?`,
      args: [loteId],
    });
    if (!loteRow.rows.length) return { success: false, msg: "Lote no encontrado." };
    if (loteRow.rows[0].estado !== "publicado")
      return { success: false, msg: "Solo se puede cerrar un lote publicado." };

    await db.execute({
      sql: `UPDATE lotes SET estado='cerrado', closed_at=datetime('now'), closed_by=? WHERE id=?`,
      args: [session.id, loteId],
    });

    revalidatePath("/admin");
    revalidatePath("/admin/actualizacion");
    revalidatePath("/admin/actualizacion-updates");
    revalidatePath("/client/actualizacion");
    return { success: true, msg: `Lote #${loteId} cerrado.` };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}
