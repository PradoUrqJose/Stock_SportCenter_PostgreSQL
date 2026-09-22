import { ReponerTable } from "@/components/admin/analisis/reponer-table";
import { PageHelp } from "@/components/ui/page-help";
import { requireModule, requireRole } from "@/lib/auth";
import { fetchParaReponer } from "@/lib/queries/reponer";

const HELP = [
  { term: "Qué muestra", desc: "Productos cuyas unidades están exclusivamente en JAL1 y/o JAL4 en el último stock cargado." },
  { term: "Prioridad", desc: "Los únicos se destacan porque su única unidad aún no llega a una tienda. Ordena por Unidades para revisar también los productos con mayor cantidad acumulada." },
  { term: "Aviso diario", desc: "No compara cargas históricas: se actualiza por completo cada vez que se sube el stock diario." },
];

export default async function ReponerPage() {
  const session = await requireRole("admin", "administrador_general");
  await requireModule(session, "analisis");
  const productos = await fetchParaReponer();

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Reponer</h1>
          <p className="mt-1 text-sm text-muted-foreground">Avisos de productos que siguen únicamente en almacén y aún no están en tiendas.</p>
        </div>
        <PageHelp items={HELP} />
      </div>
      <ReponerTable productos={productos} />
    </div>
  );
}
