import { getSession } from "@/lib/auth";
import { db, toPlain } from "@/lib/db";
import { fetchLotePublicadoActivo } from "@/lib/queries/lotes";
import { PageHelp } from "@/components/ui/page-help";

type KpiRow = {
  n_productos: number;
  n_marcas: number;
  stock_total: number;
  con_descuento: number;
};
type VariantesRow = { n_variantes: number };
type DistRow = { pct: number; n: number };
type LoteRow = {
  id: number;
  estado: "borrador" | "publicado" | "cerrado";
  created_at: string;
  published_at: string | null;
};
type ConfRow = { estado: string; n: number };
type SyncRow = { tipo: string; ejecutado_at: string; filas: number | null };

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-[#dddddd] bg-white px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[#41454d]">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ?? "text-[#181d26]"}`}>
        {typeof value === "number" ? value.toLocaleString("es-PE") : value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-[#41454d]">{sub}</p>}
    </div>
  );
}

export default async function AdminPage() {
  const session = await getSession();

  const [kpiResult, varResult, distResult, loteResult, syncResult] = await Promise.all([
    db.execute(`
      SELECT COUNT(*) AS n_productos,
             COUNT(DISTINCT marca) AS n_marcas,
             COALESCE(SUM(stock_total), 0) AS stock_total,
             COUNT(CASE WHEN descuento > 0 THEN 1 END) AS con_descuento
      FROM productos
    `),
    db.execute(`SELECT COUNT(*) AS n_variantes FROM variantes`),
    db.execute(`
      SELECT ROUND(descuento) AS pct, COUNT(*) AS n
      FROM productos WHERE descuento > 0
      GROUP BY ROUND(descuento) ORDER BY ROUND(descuento)
    `),
    db.execute(`
      SELECT id, estado, created_at, published_at
      FROM lotes WHERE estado = 'borrador'
      ORDER BY id DESC LIMIT 1
    `),
    db.execute(`
      SELECT tipo, ejecutado_at, filas
      FROM sync_log ORDER BY ejecutado_at DESC LIMIT 4
    `),
  ]);

  const kpi = toPlain<KpiRow>(kpiResult.rows)[0] ?? {
    n_productos: 0, n_marcas: 0, stock_total: 0, con_descuento: 0,
  };
  const { n_variantes } = (toPlain<VariantesRow>(varResult.rows)[0] ?? { n_variantes: 0 });
  const dist = toPlain<DistRow>(distResult.rows);
  const lote = loteResult.rows.length > 0 ? toPlain<LoteRow>(loteResult.rows)[0] : null;
  const syncs = toPlain<SyncRow>(syncResult.rows);
  const publicado = await fetchLotePublicadoActivo();

  let confCounts = { pendiente: 0, confirmado: 0, rechazado: 0 };
  if (publicado) {
    const confResult = await db.execute({
      sql: `SELECT estado, COUNT(*) AS n FROM confirmaciones WHERE lote_id = ? GROUP BY estado`,
      args: [publicado.id],
    });
    for (const r of toPlain<ConfRow>(confResult.rows)) {
      if (r.estado === "pendiente") confCounts.pendiente = r.n;
      else if (r.estado === "confirmado") confCounts.confirmado = r.n;
      else if (r.estado === "rechazado") confCounts.rechazado = r.n;
    }
  }

  const totalConf = confCounts.pendiente + confCounts.confirmado + confCounts.rechazado;
  const sinDescuento = kpi.n_productos - kpi.con_descuento;

  function fmt(iso: string) {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit", month: "short", year: "numeric",
    });
  }

  function fmtHora(iso: string) {
    return new Date(iso).toLocaleTimeString("es-PE", {
      hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#181d26]">Dashboard</h1>
          <p className="mt-1 text-sm text-[#41454d]">Bienvenido, {session?.nombre}</p>
        </div>
        <PageHelp
          items={[
            { term: "Productos", desc: "Combinaciones únicas de código universal + género en el espejo del ERP." },
            { term: "Variantes", desc: "Cada talla/código de barras individual de un producto." },
            { term: "Stock total", desc: "Suma de unidades disponibles en almacén." },
            { term: "Con descuento ERP", desc: "Productos que hoy tienen algún descuento activo en el sistema." },
            { term: "Lote activo", desc: "El borrador o lote publicado de descuentos en curso." },
          ]}
        />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Productos" value={kpi.n_productos} sub={`${kpi.n_marcas} marcas`} />
        <StatCard label="Variantes" value={n_variantes} />
        <StatCard
          label="Stock total"
          value={kpi.stock_total}
          sub="unidades en almacén"
        />
        <StatCard
          label="Con descuento ERP"
          value={kpi.con_descuento}
          sub={sinDescuento > 0 ? `${sinDescuento} sin descuento` : "todos con descuento"}
          accent="text-green-700"
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Lote activo */}
        <div className="rounded-lg border border-[#dddddd] bg-white p-5">
          <h2 className="text-sm font-semibold text-[#181d26]">Lote activo</h2>
          {!lote && !publicado ? (
            <p className="mt-3 text-sm text-[#41454d]">Sin lote activo.</p>
          ) : (
            <div className="mt-3 space-y-4">
              {lote && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                      borrador
                    </span>
                    <span className="text-sm text-[#41454d]">Lote #{lote.id}</span>
                    <span className="text-xs text-[#999]">creado {fmt(lote.created_at)}</span>
                  </div>
                  <p className="text-xs text-[#41454d]">
                    En edición — publica el lote para habilitar confirmaciones.
                  </p>
                </div>
              )}

              {publicado && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                      publicado
                    </span>
                    <span className="text-sm text-[#41454d]">Lote #{publicado.id}</span>
                    <span className="text-xs text-[#999]">publicado {fmt(publicado.published_at)}</span>
                  </div>

                  {totalConf > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-xs text-[#41454d]">
                        Confirmaciones ({totalConf} tiendas × producto)
                      </p>
                      {/* Progress bar */}
                      <div className="flex h-2 overflow-hidden rounded-full bg-[#f0f0f0]">
                        {confCounts.confirmado > 0 && (
                          <div
                            className="bg-green-500"
                            style={{ width: `${(confCounts.confirmado / totalConf) * 100}%` }}
                          />
                        )}
                        {confCounts.rechazado > 0 && (
                          <div
                            className="bg-red-400"
                            style={{ width: `${(confCounts.rechazado / totalConf) * 100}%` }}
                          />
                        )}
                      </div>
                      <div className="flex gap-4 text-xs text-[#41454d]">
                        <span className="text-green-700">✓ {confCounts.confirmado} confirmadas</span>
                        <span className="text-amber-600">⏱ {confCounts.pendiente} pendientes</span>
                        {confCounts.rechazado > 0 && (
                          <span className="text-red-600">✗ {confCounts.rechazado} rechazadas</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[#41454d]">Sin confirmaciones generadas aún.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Últimos syncs */}
        <div className="rounded-lg border border-[#dddddd] bg-white p-5">
          <h2 className="text-sm font-semibold text-[#181d26]">Últimas cargas</h2>
          {syncs.length === 0 ? (
            <p className="mt-3 text-sm text-[#41454d]">Sin cargas registradas.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[#f0f0f0]">
              {syncs.map((s, i) => (
                <li key={i} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium text-[#181d26] capitalize">{s.tipo}</span>
                  <span className="text-xs text-[#41454d]">
                    {fmt(s.ejecutado_at)} {fmtHora(s.ejecutado_at)}
                    {s.filas != null && (
                      <span className="ml-2 text-[#999]">({s.filas.toLocaleString("en-US")} filas)</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Distribución de descuentos ERP */}
      {dist.length > 0 && (
        <div className="rounded-lg border border-[#dddddd] bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-[#181d26]">
            Distribución de descuentos ERP
          </h2>
          <div className="space-y-2">
            {dist.map((d) => {
              const pct = kpi.n_productos > 0 ? (d.n / kpi.n_productos) * 100 : 0;
              return (
                <div key={d.pct} className="flex items-center gap-3">
                  <span className="w-10 shrink-0 text-right text-sm font-medium text-[#181d26]">
                    {d.pct}%
                  </span>
                  <div className="flex-1 overflow-hidden rounded-full bg-[#f0f0f0]">
                    <div
                      className="h-2 rounded-full bg-blue-500"
                      style={{ width: `${Math.max(pct, 0.5)}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs text-[#41454d]">
                    {d.n.toLocaleString("es-PE")} productos
                  </span>
                </div>
              );
            })}
            {sinDescuento > 0 && (
              <div className="flex items-center gap-3">
                <span className="w-10 shrink-0 text-right text-sm font-medium text-[#999]">
                  0%
                </span>
                <div className="flex-1 overflow-hidden rounded-full bg-[#f0f0f0]">
                  <div
                    className="h-2 rounded-full bg-gray-300"
                    style={{
                      width: `${Math.max((sinDescuento / kpi.n_productos) * 100, 0.5)}%`,
                    }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-xs text-[#999]">
                  {sinDescuento.toLocaleString("es-PE")} sin dto.
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
