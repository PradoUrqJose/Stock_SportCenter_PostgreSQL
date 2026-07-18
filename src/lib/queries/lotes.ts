import { db, toPlain } from "@/lib/db";
import type { ConfirmacionFlatRow } from "@/components/admin/actualizacion/confirmaciones-panel";
import { groupConfirmaciones } from "@/lib/product-groups";

export type LoteRow = {
  id: number;
  estado: "borrador" | "publicado" | "cerrado";
  created_at: string;
  published_at: string | null;
};

export type LoteHistorialRow = {
  id: number;
  estado: "borrador" | "publicado" | "cerrado";
  created_at: string;
  published_at: string | null;
  closed_at: string | null;
  resanado_at: string | null;
  n_lineas: number;
  n_confirmaciones: number;
  n_pendiente: number;
  n_rechazado: number;
};

export async function fetchLote(loteId: number): Promise<LoteRow | null> {
  const result = await db.execute({
    sql: `SELECT id, estado, created_at, published_at FROM lotes WHERE id = ?`,
    args: [loteId],
  });
  return result.rows.length > 0 ? toPlain<LoteRow>(result.rows)[0] : null;
}

export type LotePublicadoActivo = {
  id: number;
  created_at: string;
  published_at: string;
};

export async function fetchLotePublicadoActivo(): Promise<LotePublicadoActivo | null> {
  const result = await db.execute({
    sql: `SELECT id, created_at, published_at FROM lotes WHERE estado = 'publicado' ORDER BY id DESC LIMIT 1`,
    args: [],
  });
  return result.rows.length > 0 ? toPlain<LotePublicadoActivo>(result.rows)[0] : null;
}

export async function fetchConfirmaciones(loteId: number): Promise<ConfirmacionFlatRow[]> {
  const rowsResult = await db.execute({
    sql: `SELECT c.cod_universal, c.genero, c.estado, c.tienda_id,
                 t.nombre AS tienda_nombre,
                 c.codigo_usado, v.nombre AS vendedor_nombre, c.motivo_rechazo, c.resuelto_at,
                 ll.snap_marca, ll.snap_modelo, ll.snap_precio_lista,
                 ll.descuento_antes, ll.descuento_nuevo
          FROM confirmaciones c
          JOIN tiendas t ON t.id = c.tienda_id
          LEFT JOIN vendedores v ON v.id = c.vendedor_id
          JOIN lote_lineas ll
            ON ll.lote_id = c.lote_id
           AND ll.cod_universal = c.cod_universal
           AND ll.genero = c.genero
          WHERE c.lote_id = ?
          ORDER BY ll.snap_marca, ll.snap_modelo, t.nombre`,
    args: [loteId],
  });
  return toPlain<ConfirmacionFlatRow>(rowsResult.rows);
}

export async function fetchLotesHistorial(): Promise<LoteHistorialRow[]> {
  const result = await db.execute(
    `SELECT l.id, l.estado, l.created_at, l.published_at, l.closed_at, l.resanado_at,
            (SELECT COUNT(*) FROM lote_lineas ll WHERE ll.lote_id = l.id) AS n_lineas,
            (SELECT COUNT(*) FROM confirmaciones c WHERE c.lote_id = l.id) AS n_confirmaciones,
            (SELECT COUNT(*) FROM confirmaciones c WHERE c.lote_id = l.id AND c.estado = 'pendiente') AS n_pendiente,
            (SELECT COUNT(*) FROM confirmaciones c WHERE c.lote_id = l.id AND c.estado = 'rechazado') AS n_rechazado
     FROM lotes l
     ORDER BY l.id DESC`
  );
  return toPlain<LoteHistorialRow>(result.rows);
}

export type LoteProductoResumen = {
  cod_universal: string;
  genero: string;
  snap_marca: string | null;
  snap_modelo: string | null;
  snap_precio_lista: number | null;
  precio_final: number | null;
  descuento_antes: number;
  descuento_nuevo: number;
  n_pendiente: number;
  n_confirmado: number;
  n_rechazado: number;
};

export async function fetchLoteProductos(
  loteId: number,
  estado: "borrador" | "publicado" | "cerrado"
): Promise<LoteProductoResumen[]> {
  if (estado === "borrador") {
    const result = await db.execute({
      sql: `SELECT cod_universal, genero, snap_marca, snap_modelo, snap_precio_lista,
                   descuento_antes, descuento_nuevo
            FROM lote_lineas WHERE lote_id = ? ORDER BY snap_marca, snap_modelo`,
      args: [loteId],
    });
    type LineaRow = Omit<LoteProductoResumen, "precio_final" | "n_pendiente" | "n_confirmado" | "n_rechazado">;
    return toPlain<LineaRow>(result.rows).map((l) => ({
      ...l,
      precio_final:
        l.snap_precio_lista !== null ? l.snap_precio_lista * (1 - l.descuento_nuevo / 100) : null,
      n_pendiente: 0,
      n_confirmado: 0,
      n_rechazado: 0,
    }));
  }

  const rows = await fetchConfirmaciones(loteId);
  const { groups } = groupConfirmaciones(rows);
  return groups.map((g) => ({
    cod_universal: g.cod_universal,
    genero: g.genero,
    snap_marca: g.snap_marca,
    snap_modelo: g.snap_modelo,
    snap_precio_lista: g.snap_precio_lista,
    precio_final: g.precio_final,
    descuento_antes: g.descuento_antes,
    descuento_nuevo: g.descuento_nuevo,
    n_pendiente: g.n_pendiente,
    n_confirmado: g.n_confirmado,
    n_rechazado: g.n_rechazado,
  }));
}
