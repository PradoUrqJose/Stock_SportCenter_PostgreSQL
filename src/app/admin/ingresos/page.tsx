import { requireRole, requireModule } from "@/lib/auth";
import { db, toPlain } from "@/lib/db";
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

export type IngresoRow = {
  codigo_interno: string;
  almacen: string | null;
  serie_numero: string | null;
  emision: string;
  moneda: string | null;
  subtotal: number | null;
  igv: number | null;
  dscto: number | null;
  total: number | null;
  ruc: string | null;
  proveedor: string | null;
  cmpl: string | null;
  mcdr: string | null;
  ord_compra: string | null;
};

export default async function IngresosPage() {
  const session = await requireRole("admin", "administrador_general");
  await requireModule(session, "ingresos");

  // El histórico solo trae un monto único (columna `importe`), no el desglose
  // subtotal/igv/total del scraper — COALESCE deja "Total" con el mejor monto
  // disponible sin importar el origen de la fila.
  const result = await db.execute(
    `SELECT codigo_interno, almacen, serie_numero, emision, moneda,
            subtotal, igv, dscto, COALESCE(total, importe) AS total,
            ruc, proveedor, cmpl, mcdr, ord_compra
     FROM ingresos
     ORDER BY emision DESC`
  );

  const ingresos = toPlain<IngresoRow>(result.rows);

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
