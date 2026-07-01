import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole, requireModule } from "@/lib/auth";
import { fetchLotesHistorial, fetchLoteProductos } from "@/lib/queries/lotes";
import { LotesHistorialPanel } from "@/components/admin/actualizacion/lotes-historial-panel";

export default async function LotesHistorialPage() {
  const session = await requireRole("admin", "administrador_general");
  await requireModule(session, "registro");

  const lotesBase = await fetchLotesHistorial();
  const lotes = await Promise.all(
    lotesBase.map(async (l) => ({
      ...l,
      productos: await fetchLoteProductos(l.id, l.estado),
    }))
  );

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Historial de lotes</h1>
        <Link
          href="/admin/actualizacion-updates"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver al lote actual
        </Link>
      </div>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        {lotes.length > 0
          ? `${lotes.length} lote(s) · haz clic en un lote para ver su detalle.`
          : "Aún no se ha creado ningún lote."}
      </p>
      <LotesHistorialPanel lotes={lotes} />
    </div>
  );
}
