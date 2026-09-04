import { requireRole, requireModule } from "@/lib/auth";
import { fetchFacturacion } from "@/lib/queries/facturacion";
import { FacturacionTable } from "@/components/admin/facturacion/facturacion-table";
import { PageHelp } from "@/components/ui/page-help";

export const maxDuration = 60;

const HELP = [
  { term: "N° Documento", desc: "Serie-número del comprobante emitido (ej. FJ01-4340)." },
  { term: "Cliente", desc: "Minorista al que se le facturó." },
  { term: "Sincronizar", desc: "Trae la facturación nueva del ERP (la ya cargada se ignora)." },
];

export default async function FacturacionPage() {
  const session = await requireRole("admin", "administrador_general");
  await requireModule(session, "facturacion");

  const facturacion = await fetchFacturacion();

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Facturación a Minoristas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {facturacion.length > 0
              ? `${facturacion.length.toLocaleString("en-US")} documentos registrados.`
              : "Sin facturación cargada."}
          </p>
        </div>
        <PageHelp items={HELP} />
      </div>
      <FacturacionTable facturacion={facturacion} />
    </div>
  );
}
