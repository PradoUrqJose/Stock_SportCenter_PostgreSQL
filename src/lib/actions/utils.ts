"use server";

import { revalidatePath } from "next/cache";
import { db, toPlain } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { guardarDescuentos, agregarLineasALotePublicado, type LineaInput } from "@/lib/actions/descuentos";
import type { ActionResult } from "@/types";

const CHUNK = 500;

// ─── Vendedores masivo (Usuario + Nombre + Credencial + Activo) ──────────────
// Se crean sin tienda asociada: quedan como credencial global (ver resolveVendedor
// en confirmaciones.ts), asignable a una tienda después vía el CRUD si hace falta.

export async function crearVendedoresMasivoBatch(
  items: { usuario: string; nombre: string; codigo: string; activo: boolean }[]
): Promise<ActionResult<{ creados: number; duplicados: number }>> {
  try {
    await requireRole("admin", "administrador_general");
    if (items.length === 0) return { success: true, msg: "Sin cambios", data: { creados: 0, duplicados: 0 } };

    let creados = 0;
    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK);
      const results = await db.batch(
        chunk.map((it) => ({
          sql: `INSERT INTO vendedores (usuario, nombre, codigo, activo)
                VALUES (?, ?, ?, ?) ON CONFLICT (codigo) DO NOTHING`,
          args: [it.usuario, it.nombre, it.codigo, it.activo ? 1 : 0],
        })),
        "write"
      );
      creados += results.reduce((sum, r) => sum + (r.rowsAffected ?? 0), 0);
    }
    const duplicados = items.length - creados;

    revalidatePath("/admin/gestion/credenciales");
    return {
      success: true,
      msg: `${creados} credencial(es) creada(s)${duplicados > 0 ? `, ${duplicados} código(s) ya existían` : ""}.`,
      data: { creados, duplicados },
    };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}

// ─── Imágenes masivas (COD. UNIVERSAL + ENLACE DE IMAGEN) ────────────────────

export async function subirImagenesMasivoBatch(
  items: { cod_universal: string; imagen_url: string }[]
): Promise<ActionResult<{ aplicadas: number }>> {
  try {
    await requireRole("admin", "administrador_general");
    if (items.length === 0) return { success: true, msg: "Sin cambios", data: { aplicadas: 0 } };

    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK);
      await db.batch(
        chunk.map((it) => ({
          sql: `INSERT INTO producto_imagenes (cod_universal, imagen_url, source)
                VALUES (?, ?, 'sistema')
                ON CONFLICT (cod_universal)
                DO UPDATE SET imagen_url = excluded.imagen_url, source = 'sistema', updated_at = now_text()`,
          args: [it.cod_universal, it.imagen_url],
        })),
        "write"
      );
    }

    revalidatePath("/admin/actualizacion");
    revalidatePath("/admin/productos");
    return { success: true, msg: `${items.length} imagen(es) aplicada(s)`, data: { aplicadas: items.length } };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}

// ─── Descuentos masivos (COD. UNIVERSAL + DESCUENTO) ─────────────────────────

export type DescuentoMasivoMatch = {
  cod_universal: string;
  genero: string;
  marca: string | null;
  modelo: string | null;
  categoria: string | null;
  color: string | null;
  precio_lista: number | null;
  descuento_actual: number;
  descuento_nuevo: number;
};

export async function matchDescuentosMasivo(
  items: { cod_universal: string; descuento: number }[]
): Promise<ActionResult<{ matches: DescuentoMasivoMatch[]; noEncontrados: string[]; invalidos: string[] }>> {
  try {
    await requireRole("admin", "administrador_general");

    const invalidos: string[] = [];
    const descuentoPorCodigo = new Map<string, number>();
    for (const it of items) {
      const cod = it.cod_universal.trim().toUpperCase();
      if (!cod) continue;
      if (typeof it.descuento !== "number" || isNaN(it.descuento) || it.descuento < 0 || it.descuento > 100) {
        invalidos.push(cod);
        continue;
      }
      descuentoPorCodigo.set(cod, it.descuento);
    }

    const codes = [...descuentoPorCodigo.keys()];
    if (codes.length === 0) {
      return { success: false, msg: "El archivo no contiene códigos con descuento válido (0-100)." };
    }

    const placeholders = codes.map(() => "?").join(",");
    const result = await db.execute({
      sql: `SELECT cod_universal, genero, marca, modelo, categoria, color, precio_lista, descuento
            FROM productos WHERE cod_universal IN (${placeholders})`,
      args: codes,
    });
    const rows = toPlain<{
      cod_universal: string;
      genero: string;
      marca: string | null;
      modelo: string | null;
      categoria: string | null;
      color: string | null;
      precio_lista: number | null;
      descuento: number;
    }>(result.rows);

    const matches: DescuentoMasivoMatch[] = rows.map((r) => ({
      cod_universal: r.cod_universal,
      genero: r.genero,
      marca: r.marca,
      modelo: r.modelo,
      categoria: r.categoria,
      color: r.color,
      precio_lista: r.precio_lista,
      descuento_actual: r.descuento,
      descuento_nuevo: descuentoPorCodigo.get(r.cod_universal)!,
    }));

    const foundCodes = new Set(rows.map((r) => r.cod_universal));
    const noEncontrados = codes.filter((c) => !foundCodes.has(c));

    return {
      success: true,
      msg: `${matches.length} producto(s) encontrados de ${codes.length} código(s) leídos.`,
      data: { matches, noEncontrados, invalidos },
    };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}

export type DescuentoMasivoDestino = { tipo: "borrador" } | { tipo: "publicado"; loteId: number };

export async function aplicarDescuentosMasivo(
  items: LineaInput[],
  destino: DescuentoMasivoDestino
): Promise<ActionResult<{ loteId: number }>> {
  if (destino.tipo === "publicado") {
    const r = await agregarLineasALotePublicado(destino.loteId, items);
    return r.success
      ? { success: true, msg: r.msg, data: { loteId: destino.loteId } }
      : { success: false, msg: r.msg };
  }
  return guardarDescuentos(items);
}
