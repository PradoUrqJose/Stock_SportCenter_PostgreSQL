import { requireRole, requireModule } from "@/lib/auth";
import { fetchIngresos } from "@/lib/queries/ingresos";
import { IngresosTable } from "@/components/admin/ingresos/ingresos-table";
import { PageHelp } from "@/components/ui/page-help";

// El botón Sincronizar llama a la función Python (api/sincronizar.py) y
// después hace los INSERT — puede tardar más que el default de 10s en Hobby.
export const maxDuration = 60;

const HELP = [
  { term: "Código interno", desc: "Identificador del documento de ingreso en el ERP." },
  { term: "Serie-Número", desc: "Número del comprobante del proveedor (factura/guía)." },
  { term: "Sincronizar", desc: "Trae los ingresos nuevos del ERP (los ya cargados se ignoran)." },
];

export type { IngresoRow } from "@/lib/queries/ingresos";

export default async function IngresosPage() {
  const session = await requireRole("admin", "administrador_general");
  await requireModule(session, "ingresos");

  const ingresos = await fetchIngresos();

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Ingresos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ingresos.length > 0
              ? `${ingresos.length.toLocaleString("en-US")} ingresos registrados.`
              : "Sin ingresos cargados."}
          </p>
        </div>
        <PageHelp items={HELP} />
      </div>
      <IngresosTable ingresos={ingresos} />
    </div>
  );
}
