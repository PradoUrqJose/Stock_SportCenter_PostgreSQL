// Estado persistido: filtrar la pantalla no vuelve a consultar el ERP.
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { ALMACENES, normalizarFiltros } from "@/lib/marketing-catalogo";
import { consultarProductosParaImagenesErp } from "@/lib/marketing-erp";
import {
  productosRevisionImagen,
  codigosImagenesR2,
  sinImagenRegistrada,
  type ProductoRevisionImagen,
} from "@/lib/marketing-imagenes-pendientes";
import { r2ListarOriginales } from "@/lib/r2";

export type EstadoRevisionImagen = {
  id: string;
  estado: "en_curso" | "listo" | "error";
  mensaje: string | null;
};
const CADUCIDAD_MS = 6 * 60_000;

/** La pantalla y el Excel comparten el mismo inventario y cruce vigente de imágenes. */
export async function revisionImagenesConPendientes() {
  const [revision, imagenes] = await Promise.all([
    datosRevisionImagenes(),
    r2ListarOriginales(),
  ]);
  return {
    ...revision,
    pendientes: sinImagenRegistrada(
      revision.productos,
      codigosImagenesR2(imagenes),
    ),
  };
}

function estadoDe(f: Record<string, unknown>): EstadoRevisionImagen {
  const vencida =
    f.estado === "en_curso" &&
    Date.now() - new Date(f.iniciado_at as string).getTime() > CADUCIDAD_MS;
  return {
    id: f.id as string,
    estado: vencida ? "error" : (f.estado as EstadoRevisionImagen["estado"]),
    mensaje: vencida
      ? "La consulta no terminó. Puedes volver a actualizar desde el ERP."
      : (f.mensaje as string | null),
  };
}

export async function estadoRevisionImagen(
  id: string,
): Promise<EstadoRevisionImagen | null> {
  const r = await db.execute({
    sql: "SELECT id, estado, mensaje, iniciado_at FROM mk_revision_imagenes WHERE id = ?",
    args: [id],
  });
  return r.rows[0] ? estadoDe(r.rows[0]) : null;
}

export async function datosRevisionImagenes(): Promise<{
  consulta: EstadoRevisionImagen | null;
  productos: ProductoRevisionImagen[];
  consultadoAl: string | null;
  almacenes: string[];
}> {
  const [ultima, correcta] = await Promise.all([
    db.execute(
      "SELECT id, estado, mensaje, iniciado_at FROM mk_revision_imagenes ORDER BY iniciado_at DESC LIMIT 1",
    ),
    db.execute(
      "SELECT productos, terminado_at, almacenes FROM mk_revision_imagenes WHERE estado = 'listo' ORDER BY terminado_at DESC LIMIT 1",
    ),
  ]);
  const fila = correcta.rows[0];
  return {
    consulta: ultima.rows[0] ? estadoDe(ultima.rows[0]) : null,
    productos: fila ? JSON.parse(fila.productos as string) : [],
    consultadoAl: fila
      ? new Date(fila.terminado_at as string).toISOString()
      : null,
    almacenes: fila ? JSON.parse(fila.almacenes as string) : [...ALMACENES],
  };
}

/** La restricción única de la tabla admite una sola consulta activa entre todos los usuarios. */
export async function crearRevisionImagenes(
  userId: string,
): Promise<{ id: string; nueva: boolean }> {
  await db.execute(
    "UPDATE mk_revision_imagenes SET estado = 'error', mensaje = 'La consulta no terminó; vuelve a actualizar', terminado_at = now() WHERE estado = 'en_curso' AND iniciado_at < now() - interval '6 minutes'",
  );
  const id = randomUUID();
  const r = await db.execute({
    sql: "INSERT INTO mk_revision_imagenes (id, almacenes, created_by) VALUES (?, ?, ?) ON CONFLICT DO NOTHING RETURNING id",
    args: [id, JSON.stringify([...ALMACENES]), userId],
  });
  if (r.rows.length) return { id, nueva: true };
  const activa = await db.execute(
    "SELECT id FROM mk_revision_imagenes WHERE estado = 'en_curso' LIMIT 1",
  );
  if (!activa.rows[0])
    throw new Error(
      "No se pudo recuperar la consulta activa; vuelve a intentarlo",
    );
  return { id: activa.rows[0].id as string, nueva: false };
}

export async function ejecutarRevisionImagenes(
  id: string,
  origen?: string,
): Promise<void> {
  try {
    const { items } = await consultarProductosParaImagenesErp(
      normalizarFiltros({ almacenes: [...ALMACENES], stock_minimo: 1 }),
      origen,
    );
    const productos = productosRevisionImagen(items);
    await db.execute({
      sql: "UPDATE mk_revision_imagenes SET estado = 'listo', productos = ?, terminado_at = now(), mensaje = NULL WHERE id = ? AND estado = 'en_curso'",
      args: [JSON.stringify(productos), id],
    });
  } catch (e) {
    console.error("[marketing] revisión de imágenes falló:", e);
    await db.execute({
      sql: "UPDATE mk_revision_imagenes SET estado = 'error', mensaje = ?, terminado_at = now() WHERE id = ? AND estado = 'en_curso'",
      args: [
        e instanceof Error ? e.message : "No se pudo consultar el ERP",
        id,
      ],
    });
  }
}
