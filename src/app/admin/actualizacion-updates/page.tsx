import Link from "next/link";
import { History } from "lucide-react";
import { requireRole, requireModule } from "@/lib/auth";
import { db, toPlain } from "@/lib/db";
import { ConfirmacionesPanel } from "@/components/admin/actualizacion/confirmaciones-panel";
import {
  BorradorReviewPanel,
  type BorradorLineaRow,
} from "@/components/admin/actualizacion/borrador-review-panel";
import { fetchConfirmaciones, fetchLotePublicadoActivo, type LoteRow } from "@/lib/queries/lotes";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const HistorialLink = () => (
  <Link
    href="/admin/actualizacion-updates/historial"
    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
  >
    <History className="h-3.5 w-3.5" />
    Ver historial de lotes
  </Link>
);

export default async function ActualizacionUpdatesPage() {
  const session = await requireRole("admin", "administrador_general");
  await requireModule(session, "registro");

  // Two independent lotes can now coexist: a borrador in progress (pending review/
  // publish) and a currently published lote whose confirmations are still being
  // collected. When both exist, they're split into tabs below.
  const borradorResult = await db.execute({
    sql: `SELECT id, created_at FROM lotes WHERE estado = 'borrador' ORDER BY id DESC LIMIT 1`,
    args: [],
  });
  const borrador =
    borradorResult.rows.length > 0
      ? toPlain<{ id: number; created_at: string }>(borradorResult.rows)[0]
      : null;

  let borradorLineas: BorradorLineaRow[] = [];
  if (borrador) {
    const lineasResult = await db.execute({
      sql: `SELECT cod_universal, genero, snap_marca, snap_modelo, snap_categoria, snap_color,
                   snap_precio_lista, descuento_antes, descuento_nuevo
            FROM lote_lineas WHERE lote_id = ? ORDER BY snap_marca, snap_modelo`,
      args: [borrador.id],
    });
    borradorLineas = toPlain<BorradorLineaRow>(lineasResult.rows);
  }
  const showBorradorPanel = !!borrador && borradorLineas.length > 0;

  const publicado = await fetchLotePublicadoActivo();

  if (!showBorradorPanel && !publicado) {
    const cerradoResult = await db.execute({
      sql: `SELECT id, estado, created_at, published_at FROM lotes WHERE estado = 'cerrado' ORDER BY id DESC LIMIT 1`,
      args: [],
    });
    if (cerradoResult.rows.length === 0) {
      return (
        <div className="p-4 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold text-foreground">Registro de cambios</h1>
            <HistorialLink />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            No hay ningún lote publicado ni cerrado aún.
          </p>
        </div>
      );
    }
    const cerrado = toPlain<LoteRow>(cerradoResult.rows)[0];
    const rows = await fetchConfirmaciones(cerrado.id);
    return (
      <div className="p-4 md:p-8">
        <ConfirmacionesPanel
          rows={rows}
          loteId={cerrado.id}
          loteEstado="cerrado"
          publishedAt={cerrado.published_at!}
          headerExtra={<HistorialLink />}
        />
      </div>
    );
  }

  const confRows = publicado ? await fetchConfirmaciones(publicado.id) : [];

  // Both a borrador awaiting review and a publicado lote awaiting confirmations can
  // exist at once — when they do, split them into tabs instead of showing both in full
  // at the same time.
  if (showBorradorPanel && publicado) {
    return (
      <div className="p-4 md:p-8">
        <Tabs defaultValue="borrador">
          <TabsList>
            <TabsTrigger value="borrador">Borrador #{borrador!.id}</TabsTrigger>
            <TabsTrigger value="publicado">Publicado #{publicado.id}</TabsTrigger>
          </TabsList>
          <TabsContent value="borrador">
            <BorradorReviewPanel
              loteId={borrador!.id}
              createdAt={borrador!.created_at}
              lineas={borradorLineas}
              headerExtra={<HistorialLink />}
            />
          </TabsContent>
          <TabsContent value="publicado">
            <ConfirmacionesPanel
              rows={confRows}
              loteId={publicado.id}
              loteEstado="publicado"
              publishedAt={publicado.published_at}
              headerExtra={<HistorialLink />}
            />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  if (showBorradorPanel) {
    return (
      <div className="p-4 md:p-8">
        <BorradorReviewPanel
          loteId={borrador!.id}
          createdAt={borrador!.created_at}
          lineas={borradorLineas}
          headerExtra={<HistorialLink />}
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <ConfirmacionesPanel
        rows={confRows}
        loteId={publicado!.id}
        loteEstado="publicado"
        publishedAt={publicado!.published_at}
        headerExtra={<HistorialLink />}
      />
    </div>
  );
}
