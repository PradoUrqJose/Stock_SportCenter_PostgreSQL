"use server";

import { db, toPlain } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { guardarDescuentos, agregarLineasALotePublicado } from "@/lib/actions/descuentos";
import type { ActionResult } from "@/types";

export type ReposicionMatch = {
  cod_universal: string;
  genero: string;
  marca: string | null;
  modelo: string | null;
  categoria: string | null;
  color: string | null;
  precio_lista: number | null;
  descuento: number;
};

export async function matchReposicion(
  codigos: string[]
): Promise<ActionResult<{ matches: ReposicionMatch[]; noEncontrados: string[] }>> {
  try {
    await requireRole("admin", "administrador_general");
    const codes = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))];
    if (codes.length === 0) return { success: false, msg: "El archivo no contiene códigos." };

    const placeholders = codes.map(() => "?").join(",");
    const result = await db.execute({
      sql: `SELECT cod_universal, genero, marca, modelo, categoria, color, precio_lista, descuento
            FROM productos WHERE cod_universal IN (${placeholders})`,
      args: codes,
    });
    const rows = toPlain<ReposicionMatch>(result.rows);

    const matches = rows.filter((r) => r.descuento > 0);
    const foundCodes = new Set(rows.map((r) => r.cod_universal));
    const noEncontrados = codes.filter((c) => !foundCodes.has(c));

    return {
      success: true,
      msg: `${matches.length} producto(s) con descuento activo de ${codes.length} código(s) leídos.`,
      data: { matches, noEncontrados },
    };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}

export type ReposicionDestino = { tipo: "borrador" } | { tipo: "publicado"; loteId: number };

export async function aplicarReposicion(
  items: { cod_universal: string; genero: string }[],
  destino: ReposicionDestino
): Promise<ActionResult<{ loteId: number }>> {
  const lineas = items.map((i) => ({ ...i, descuento_nuevo: 0 }));
  if (destino.tipo === "publicado") {
    const r = await agregarLineasALotePublicado(destino.loteId, lineas);
    return r.success
      ? { success: true, msg: r.msg, data: { loteId: destino.loteId } }
      : { success: false, msg: r.msg };
  }
  return guardarDescuentos(lineas);
}
