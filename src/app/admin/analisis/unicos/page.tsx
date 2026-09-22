import { UnicosTable } from "@/components/admin/unicos/unicos-table";
import { PageHelp } from "@/components/ui/page-help";
import { requireModule, requireRole } from "@/lib/auth";
import { fetchUnicos } from "@/lib/queries/unicos";

const HELP = [
  { term: "Únicos", desc: "Productos con exactamente una unidad en el último stock cargado." },
  { term: "Ubicación", desc: "Indica dónde está la única unidad: almacén o tienda." },
];

export default async function UnicosPage() {
  const session = await requireRole("admin", "administrador_general");
  await requireModule(session, "analisis");
  const unicos = await fetchUnicos();

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Únicos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Productos con una sola unidad disponible en el último stock cargado.</p>
        </div>
        <PageHelp items={HELP} />
      </div>
      <UnicosTable unicos={unicos} />
    </div>
  );
}
