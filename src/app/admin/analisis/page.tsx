import { requireRole, requireModule } from "@/lib/auth";
import {
  hasVentas,
  fetchAnalisisKpis,
  fetchProductosAnalisis,
  fetchTendenciaMensual,
  fetchModelosRanking,
} from "@/lib/queries/analisis";
import { fetchUnicos } from "@/lib/queries/unicos";
import { AnalisisDashboard } from "@/components/admin/analisis/analisis-dashboard";
import { PageHelp } from "@/components/ui/page-help";

// La subida de ventas corre server actions (uploadVentasBatch/finalizeVentasUpload)
// que Vercel factura al maxDuration de esta ruta, no al del archivo de actions.
// El default del plan (10s en Hobby) se queda corto para varios lotes de 2000 filas.
export const maxDuration = 60;

const HELP = [
  { term: "Unidades vendidas", desc: "Total de unidades en el histórico cargado (cada código de barras es una unidad)." },
  { term: "Importe total", desc: "Suma de las ventas en soles. Los regalos entran como 0." },
  { term: "Días prom. para vender", desc: "Desde que la unidad ingresó (según su código de barras) hasta que se vendió." },
  { term: "Cobertura (semáforo)", desc: "Días para agotar el stock actual al ritmo reciente: verde <30, ámbar 30–90, rojo ≥90." },
  { term: "Rezagados", desc: "El producto sí rota, pero arrastra unidades atascadas ≥180 días — el promedio lo hace ver lento. Revisa esas unidades puntuales." },
  { term: "Stock muerto", desc: "Con stock, sin ventas en 90 días y antiguo. El color indica severidad según su descuento." },
  { term: "Rankings", desc: "Modelos más vendidos (marca · modelo · género); filtra por categoría para ver los top de cada categoría." },
  { term: "Únicos", desc: "Productos con una sola unidad en stock, filtrables por tienda." },
];

export default async function AnalisisPage() {
  const requestStart = Date.now();
  const session = await requireRole("admin", "administrador_general");
  await requireModule(session, "analisis");
  console.log(`[PERF][analisis] auth ${Date.now() - requestStart}ms`);

  const t0 = Date.now();
  const conVentas = await hasVentas();
  console.log(`[PERF][analisis] hasVentas ${Date.now() - t0}ms`);

  // Únicos es un reporte de stock, independiente de si hay ventas cargadas.
  const t1 = Date.now();
  const [kpis, productos, tendencia, rankings, unicos] = await Promise.all([
    conVentas ? fetchAnalisisKpis() : Promise.resolve(null),
    conVentas ? fetchProductosAnalisis() : Promise.resolve([]),
    conVentas ? fetchTendenciaMensual() : Promise.resolve([]),
    conVentas ? fetchModelosRanking() : Promise.resolve([]),
    fetchUnicos(),
  ]);
  console.log(`[PERF][analisis] oleada (5 queries) ${Date.now() - t1}ms`);
  console.log(`[PERF][analisis] total ${Date.now() - requestStart}ms`);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Análisis de ventas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rotación, stock muerto, rezagados, tendencias y stock único.
          </p>
        </div>
        <PageHelp items={HELP} />
      </div>
      <AnalisisDashboard
        sinVentas={!conVentas}
        kpis={kpis}
        productos={productos}
        tendencia={tendencia}
        rankings={rankings}
        unicos={unicos}
      />
    </div>
  );
}
