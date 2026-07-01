import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db, toPlain } from "@/lib/db";
import { requireRole, requireModule } from "@/lib/auth";
import { fetchConfirmaciones, fetchLote } from "@/lib/queries/lotes";
import { ConfirmacionesPanel } from "@/components/admin/actualizacion/confirmaciones-panel";
import {
  BorradorReviewPanel,
  type BorradorLineaRow,
} from "@/components/admin/actualizacion/borrador-review-panel";

export default async function LoteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole("admin", "administrador_general");
  await requireModule(session, "registro");

  const { id } = await params;
  const loteId = parseInt(id, 10);
  if (isNaN(loteId)) notFound();

  const lote = await fetchLote(loteId);
  if (!lote) notFound();

  const volver = (
    <Link
      href="/admin/actualizacion-updates/historial"
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Volver al historial
    </Link>
  );

  if (lote.estado === "borrador") {
    const lineasResult = await db.execute({
      sql: `SELECT cod_universal, genero, snap_marca, snap_modelo, snap_categoria, snap_color,
                   snap_precio_lista, descuento_antes, descuento_nuevo
            FROM lote_lineas WHERE lote_id = ? ORDER BY snap_marca, snap_modelo`,
      args: [loteId],
    });
    const lineas = toPlain<BorradorLineaRow>(lineasResult.rows);
    return (
      <div className="p-4 md:p-8">
        <BorradorReviewPanel
          loteId={lote.id}
          createdAt={lote.created_at}
          lineas={lineas}
          headerExtra={volver}
        />
      </div>
    );
  }

  const rows = await fetchConfirmaciones(lote.id);
  return (
    <div className="p-4 md:p-8">
      <ConfirmacionesPanel
        rows={rows}
        loteId={lote.id}
        loteEstado={lote.estado}
        publishedAt={lote.published_at!}
        headerExtra={volver}
      />
    </div>
  );
}
