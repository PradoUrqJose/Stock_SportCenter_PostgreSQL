import { db, type InStatement } from "@/lib/db";

export type ComisionVenta = {
  fecha_venta: string; codigo_venta: string; comprobante_serie: string | null; comprobante_numero: string | null;
  codigo_barras: string | null; codigo_universal: string | null; modelo: string | null; marca: string | null;
  grupo: string | null; categoria: string | null; color: string | null; talla: string | null;
  precio_compra: number | null; precio_lista: number | null; precio_venta: number; tienda: string | null;
  usuario: string | null; promocion_aplicada: number | null;
};

const CHUNK = 500;
const clave = ["codigo_venta", "codigo_barras", "comprobante_serie", "comprobante_numero"] as const;
const columnas = ["fecha_venta", ...clave, "codigo_universal", "modelo", "marca", "grupo", "categoria", "color", "talla", "precio_compra", "precio_lista", "precio_venta", "tienda", "usuario", "promocion_aplicada"] as const;

/** El exportador del ERP puede repetir líneas idénticas. PostgreSQL no permite
 * actualizarlas dos veces en un mismo INSERT ... ON CONFLICT, así que dejamos
 * una sola copia antes de construir cada lote. */
function sinDuplicados(ventas: ComisionVenta[]) {
  const unicas = new Map<string, ComisionVenta>();
  for (const venta of ventas) {
    // FJ01 corresponde a la venta Mayorista → Minorista y no participa en
    // Comisiones de tienda. Se descarta antes de persistir, no solo al mostrar.
    if (venta.comprobante_serie === "FJ01") continue;
    unicas.set(JSON.stringify(clave.map((campo) => venta[campo])), venta);
  }
  return [...unicas.values()];
}

function insertSql(ventas: ComisionVenta[]) {
  const args: unknown[] = [];
  const values = ventas.map((venta) => `(${columnas.map((columna) => `$${args.push(venta[columna])}`).join(",")})`).join(",");
  const actualizaciones = columnas
    .filter((columna) => !clave.includes(columna as typeof clave[number]))
    .map((columna) => `${columna}=EXCLUDED.${columna}`)
    .join(", ");
  return {
    sql: `INSERT INTO comisiones_ventas (${columnas.join(",")}) VALUES ${values} ON CONFLICT (codigo_venta,codigo_barras,comprobante_serie,comprobante_numero) DO UPDATE SET ${actualizaciones}, sincronizado_at=now_text()`,
    args,
  };
}

/** Reemplaza un periodo completo de forma atómica: ante cualquier error la
 * transacción revierte el DELETE y deja intacta la consulta anterior. */
export async function guardarComisiones({ inicio, fin, ventas, ejecutadoPor }: {
  inicio: string; fin: string; ventas: ComisionVenta[]; ejecutadoPor?: string | null;
}) {
  const unicas = sinDuplicados(ventas);
  const excluidasFj01 = ventas.filter((venta) => venta.comprobante_serie === "FJ01").length;
  const sentencias: InStatement[] = [{
    sql: "DELETE FROM comisiones_ventas WHERE fecha_venta >= ? AND fecha_venta <= ?",
    args: [inicio, fin],
  }];
  for (let i = 0; i < unicas.length; i += CHUNK) sentencias.push(insertSql(unicas.slice(i, i + CHUNK)));
  sentencias.push({
    sql: "INSERT INTO comisiones_sync_log (fecha_inicio, fecha_fin, filas, ejecutado_by) VALUES (?, ?, ?, ?)",
    args: [inicio, fin, unicas.length, ejecutadoPor ?? null],
  });
  await db.batch(sentencias, "write");
  return { filas: unicas.length, repetidas: ventas.length - excluidasFj01 - unicas.length, excluidasFj01 };
}
