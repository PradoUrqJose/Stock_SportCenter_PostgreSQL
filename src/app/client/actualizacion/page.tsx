import { getSession } from "@/lib/auth";
import { db, toPlain } from "@/lib/db";
import { redirect } from "next/navigation";
import {
  ConfirmacionPanel,
  type ConfirmacionRow,
} from "@/components/client/confirmacion-panel";

type LotePublicado = {
  id: number;
  published_at: string;
};

type TiendaRow = {
  nombre: string;
};

export default async function ClientActualizacionPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!session.tienda_id) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-sm text-muted-foreground">
          Tu usuario no tiene tienda asignada. Contacta al administrador.
        </p>
      </div>
    );
  }

  const tiendaResult = await db.execute({
    sql: `SELECT nombre FROM tiendas WHERE id = ?`,
    args: [session.tienda_id],
  });
  const tienda = toPlain<TiendaRow>(tiendaResult.rows)[0];

  const loteResult = await db.execute({
    sql: `SELECT id, published_at FROM lotes WHERE estado = 'publicado' ORDER BY id DESC LIMIT 1`,
    args: [],
  });
  const lote =
    loteResult.rows.length > 0
      ? toPlain<LotePublicado>(loteResult.rows)[0]
      : null;

  if (!lote) {
    return (
      <div className="p-4 md:p-8">
        <h1 className="text-xl font-semibold text-foreground">Actualización de precios</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No hay ninguna actualización publicada en este momento.
        </p>
      </div>
    );
  }

  const confResult = await db.execute({
    sql: `SELECT c.id, c.cod_universal, c.genero, c.estado, c.motivo_rechazo, c.codigo_usado,
                 ll.snap_marca, ll.snap_modelo, ll.snap_precio_lista,
                 ll.descuento_antes, ll.descuento_nuevo,
                 p.grupo, pi.imagen_url
          FROM confirmaciones c
          JOIN lote_lineas ll
            ON ll.lote_id = c.lote_id
           AND ll.cod_universal = c.cod_universal
           AND ll.genero = c.genero
          LEFT JOIN productos p
            ON p.cod_universal = c.cod_universal
           AND p.genero = c.genero
          LEFT JOIN producto_imagenes pi
            ON pi.cod_universal = c.cod_universal
          WHERE c.lote_id = ?
            AND c.tienda_id = ?
          ORDER BY ll.snap_marca, ll.snap_modelo`,
    args: [lote.id, session.tienda_id],
  });
  const confirmaciones = toPlain<ConfirmacionRow>(confResult.rows);

  return (
    <div className="p-4 md:p-8">
      <ConfirmacionPanel
        confirmaciones={confirmaciones}
        loteId={lote.id}
        tiendaNombre={tienda?.nombre ?? session.tienda_id}
        publishedAt={lote.published_at}
      />
    </div>
  );
}
