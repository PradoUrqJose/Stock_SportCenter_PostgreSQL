"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type ColDef } from "@/components/ui/data-table";
import { DiscountBadge } from "@/components/ui/discount-badge";
import { FilterBar, type SelectFilterDef } from "@/components/ui/filter-bar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VentasUploadForm } from "@/components/admin/upload/ventas-upload-form";
import { UnicosTable } from "@/components/admin/unicos/unicos-table";
import { clasificarSalud, DIAS_MUERTO, DIAS_REZAGO, type SaludInfo } from "@/lib/analisis/clasificacion";
import type {
  AnalisisKpis,
  ProductoAnalisisRow,
  MesRow,
  ModeloRankingRow,
} from "@/lib/queries/analisis";
import type { UnicoRow } from "@/lib/queries/unicos";

type Props = {
  kpis: AnalisisKpis | null;
  productos: ProductoAnalisisRow[];
  tendencia: MesRow[];
  rankings: ModeloRankingRow[];
  unicos: UnicoRow[];
  sinVentas?: boolean;
};

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const rowKey = (r: { cod_universal: string; genero: string }) => `${r.cod_universal}|${r.genero}`;

function coberturaDot(cobertura: number | null): { dot: string; title: string } {
  if (cobertura === null) return { dot: "bg-gray-300", title: "Sin ventas recientes" };
  if (cobertura < 30) return { dot: "bg-green-500", title: `${cobertura}d — rotación rápida` };
  if (cobertura < 90) return { dot: "bg-amber-400", title: `${cobertura}d — rotación moderada` };
  return { dot: "bg-red-500", title: `${cobertura}d — rotación lenta` };
}

// Color de "Vendidas 90d" en Rezagados, relativo a las unidades viejas atascadas:
// vender poco teniendo muchas unidades viejas es grave (el stock viejo no se drena).
function rezagoVentaColor(vendido90d: number, udsViejas: number): { cls: string; title: string } {
  if (vendido90d > 10) return { cls: "bg-green-100 text-green-700", title: "Rota bien" };
  if (vendido90d >= udsViejas)
    return { cls: "bg-amber-100 text-amber-700", title: "Rotación modesta — revisar las unidades viejas" };
  return { cls: "bg-red-100 text-red-700", title: "Grave — vende menos de lo que tiene atascado" };
}

const BASE_FILTERS: SelectFilterDef<ProductoAnalisisRow>[] = [
  { key: "categoria", label: "Categoría", getValue: (r) => r.categoria },
  { key: "marca", label: "Marca", getValue: (r) => r.marca },
  { key: "grupo", label: "Grupo", getValue: (r) => r.grupo },
];

const RANKING_FILTERS: SelectFilterDef<ModeloRankingRow>[] = [
  { key: "categoria", label: "Categoría", getValue: (r) => r.categoria },
  { key: "marca", label: "Marca", getValue: (r) => r.marca },
  { key: "genero", label: "Género", getValue: (r) => r.genero },
];

export function AnalisisDashboard({ kpis, productos, tendencia, rankings, unicos, sinVentas }: Props) {
  const router = useRouter();
  const [ventasOpen, setVentasOpen] = useState(false);

  const salud = useMemo(() => {
    const m = new Map<string, SaludInfo>();
    for (const p of productos) {
      m.set(
        rowKey(p),
        clasificarSalud({
          stock_total: p.stock_total,
          vendido_90d: p.vendido_90d,
          dias_ultimo_ingreso: p.dias_ultimo_ingreso,
          descuento: p.descuento,
        })
      );
    }
    return m;
  }, [productos]);

  const muertos = useMemo(
    () => productos.filter((p) => p.stock_total > 0 && salud.get(rowKey(p))?.muerto),
    [productos, salud]
  );

  // Rezagados: el producto SÍ rota (ventas recientes) pero arrastra unidades viejas atascadas.
  const rezagados = useMemo(
    () => productos.filter((p) => p.vendido_90d > 0 && p.unidades_viejas > 0),
    [productos]
  );

  const importarBtn = (
    <Button size="sm" onClick={() => setVentasOpen(true)}>
      <Upload className="h-4 w-4" />
      Importar ventas
    </Button>
  );

  return (
    <div className="space-y-6">
      {/* KPIs (o aviso si aún no hay ventas) */}
      {kpis ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Unidades vendidas" value={kpis.unidades.toLocaleString("es-PE")} />
            <Kpi label="Importe total" value={soles(kpis.importe_total)} />
            <Kpi
              label="Días prom. para vender"
              value={kpis.dias_prom != null ? `${kpis.dias_prom} d` : "—"}
            />
            <Kpi label="Rango" value={kpis.desde && kpis.hasta ? `${kpis.desde} → ${kpis.hasta}` : "—"} small />
          </div>
          {importarBtn}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            Aún no hay ventas cargadas — los tabs de ventas están vacíos. El tab <b>Únicos</b> funciona igual
            (es stock).
          </p>
          {importarBtn}
        </div>
      )}

      <Tabs defaultValue={sinVentas ? "unicos" : "rotacion"}>
        <TabsList>
          <TabsTrigger value="rotacion">Rotación</TabsTrigger>
          <TabsTrigger value="rezagados">Rezagados</TabsTrigger>
          <TabsTrigger value="muerto">Stock muerto</TabsTrigger>
          <TabsTrigger value="tendencia">Tendencia</TabsTrigger>
          <TabsTrigger value="rankings">Rankings</TabsTrigger>
          <TabsTrigger value="unicos">Únicos</TabsTrigger>
        </TabsList>

        {/* ── Rotación ── */}
        <TabsContent value="rotacion">
          <TabInfo>
            Cada fila es un producto. <b>Vendidas</b> son las unidades del histórico; <b>Días p/vender</b> es
            el promedio real que tardó en venderse desde que ingresó. El <b>semáforo de cobertura</b> estima
            cuántos días tardarías en agotar el stock actual al ritmo de venta reciente:{" "}
            <span className="text-green-600 font-medium">verde</span> rota rápido,{" "}
            <span className="text-amber-600 font-medium">ámbar</span> moderado,{" "}
            <span className="text-red-600 font-medium">rojo</span> lento (candidato a descuento),{" "}
            <span className="text-gray-500 font-medium">gris</span> sin ventas recientes. Ordena por
            cualquier columna para ver los extremos.
          </TabInfo>
          <FilterBar
            data={productos}
            filters={BASE_FILTERS}
            searchPlaceholder="Buscar por código, marca o modelo…"
            getSearchText={(r) => `${r.cod_universal} ${r.marca ?? ""} ${r.modelo ?? ""}`}
          >
            {(filtered) => (
              <DataTable
                columns={rotacionColumns}
                data={filtered}
                keyFn={rowKey}
                defaultSort={{ key: "unidades", dir: "desc" }}
                pageSize={50}
                emptyTitle="Sin datos"
              />
            )}
          </FilterBar>
        </TabsContent>

        {/* ── Rezagados ── */}
        <TabsContent value="rezagados">
          <TabInfo>
            <span className="font-medium text-[#181d26]">{rezagados.length.toLocaleString("es-PE")} producto(s)</span>{" "}
            que tuvieron ventas en 90 días pero arrastran unidades en stock desde hace <b>≥ {DIAS_REZAGO} días</b>.
            El color de <b>Vendidas 90d</b> mide qué tan grave es respecto a lo atascado:{" "}
            <span className="font-medium text-green-600">verde</span> vende &gt;10 (rota bien);{" "}
            <span className="font-medium text-amber-600">ámbar</span> vende poco pero al menos tanto como las
            unidades viejas;{" "}
            <span className="font-medium text-red-600">rojo</span> = <b>grave</b>: vende menos de lo que tiene
            atascado, el stock viejo no se drena (revisar de inmediato). <b>Uds. viejas</b> = unidades atascadas;{" "}
            <b>Más viejo</b> = días de la más antigua.
          </TabInfo>
          <FilterBar
            data={rezagados}
            filters={BASE_FILTERS}
            searchPlaceholder="Buscar por código, marca o modelo…"
            getSearchText={(r) => `${r.cod_universal} ${r.marca ?? ""} ${r.modelo ?? ""}`}
          >
            {(filtered) => (
              <DataTable
                columns={rezagadoColumns}
                data={filtered}
                keyFn={rowKey}
                defaultSort={{ key: "unidades_viejas", dir: "desc" }}
                pageSize={50}
                emptyTitle="Sin rezagados"
                emptyDesc="Ningún producto que rote tiene unidades atascadas."
              />
            )}
          </FilterBar>
        </TabsContent>

        {/* ── Stock muerto ── */}
        <TabsContent value="muerto">
          <TabInfo>
            <span className="font-medium text-[#181d26]">{muertos.length.toLocaleString("es-PE")} producto(s)</span>{" "}
            con stock, sin ventas en {DIAS_MUERTO} días y antiguos. El <b>diagnóstico</b> depende del descuento
            actual — de menos a más grave:{" "}
            <span className="text-amber-600 font-medium">amarillo</span> = sin descuento (aplicar uno);{" "}
            <span className="text-orange-600 font-medium">naranja</span> = ya con descuento pero no basta (subir
            escalón);{" "}
            <span className="text-red-600 font-medium">rojo</span> = no vende pese a descuento alto (no responde
            al precio → liquidar). <b>Sin reponer</b> = días desde el último ingreso de ese producto.
          </TabInfo>
          <FilterBar
            data={muertos}
            filters={BASE_FILTERS}
            searchPlaceholder="Buscar por código, marca o modelo…"
            getSearchText={(r) => `${r.cod_universal} ${r.marca ?? ""} ${r.modelo ?? ""}`}
          >
            {(filtered) => (
              <DataTable
                columns={muertoColumns(salud)}
                data={filtered}
                keyFn={rowKey}
                defaultSort={{ key: "dias_ultimo_ingreso", dir: "desc" }}
                pageSize={50}
                emptyTitle="Sin stock muerto"
                emptyDesc="Ningún producto cae en la clasificación de muerto."
              />
            )}
          </FilterBar>
        </TabsContent>

        {/* ── Tendencia ── */}
        <TabsContent value="tendencia">
          <TabInfo>
            Ventas agregadas por mes: <b>unidades</b> e <b>importe</b> en soles. Sirve para ver estacionalidad y
            crecimiento; se vuelve más útil conforme acumulas más meses de histórico. Ordena por mes o por
            volumen.
          </TabInfo>
          <DataTable
            columns={tendenciaColumns}
            data={tendencia}
            keyFn={(r) => r.mes}
            pageSize={24}
            emptyTitle="Sin datos"
          />
        </TabsContent>

        {/* ── Rankings ── */}
        <TabsContent value="rankings">
          <TabInfo>
            <b>Modelos más vendidos</b> — el ranking es por <b>marca · modelo · género</b> (el modelo real, no la
            marca suelta). <b>Filtra por categoría</b> para ver los modelos más vendidos de esa categoría. Ordena
            por unidades o importe.
          </TabInfo>
          <FilterBar
            data={rankings}
            filters={RANKING_FILTERS}
            searchPlaceholder="Buscar por modelo o marca…"
            getSearchText={(r) => `${r.marca ?? ""} ${r.modelo ?? ""}`}
          >
            {(filtered) => (
              <DataTable
                columns={rankingColumns}
                data={filtered}
                keyFn={(r) => `${r.marca ?? ""}|${r.modelo ?? ""}|${r.genero ?? ""}`}
                defaultSort={{ key: "unidades", dir: "desc" }}
                pageSize={50}
                emptyTitle="Sin datos"
              />
            )}
          </FilterBar>
        </TabsContent>

        {/* ── Únicos ── */}
        <TabsContent value="unicos">
          <TabInfo>
            <span className="font-medium text-[#181d26]">{unicos.length.toLocaleString("es-PE")} producto(s)</span>{" "}
            con <b>una sola unidad</b> en stock. <b>Filtra por tienda</b> para ver los únicos de cada local — útil
            para consolidar últimas unidades, liquidar o reponer. <b>Talla</b> suele ser el último resto de una
            curva; <b>antigüedad</b> alta = más difícil de vender.
          </TabInfo>
          <UnicosTable unicos={unicos} />
        </TabsContent>
      </Tabs>

      <VentasDialog open={ventasOpen} setOpen={setVentasOpen} router={router} />
    </div>
  );
}

// ─── Columns ──────────────────────────────────────────────────────────────────

const codigoCol: ColDef<ProductoAnalisisRow> = {
  key: "cod_universal",
  header: "Código",
  width: 1,
  sortable: true,
  sortValue: (r) => r.cod_universal,
  cell: (r) => <span className="font-mono text-xs text-[#181d26]">{r.cod_universal}</span>,
};

const marcaCol: ColDef<ProductoAnalisisRow> = {
  key: "marca",
  header: "Marca",
  width: 1,
  sortable: true,
  sortValue: (r) => r.marca ?? "",
  cell: (r) => <span className="text-sm">{r.marca ?? "—"}</span>,
};

const modeloCol: ColDef<ProductoAnalisisRow> = {
  key: "modelo",
  header: "Modelo",
  width: 2,
  sortable: true,
  sortValue: (r) => r.modelo ?? "",
  cell: (r) => <span className="text-sm">{r.modelo ?? "—"}</span>,
};

const rotacionColumns: ColDef<ProductoAnalisisRow>[] = [
  codigoCol,
  marcaCol,
  modeloCol,
  {
    key: "unidades",
    header: "Vendidas",
    width: 1,
    align: "center",
    sortable: true,
    sortValue: (r) => r.unidades,
    cell: (r) => <span className="text-sm font-medium">{r.unidades.toLocaleString("es-PE")}</span>,
  },
  {
    key: "dias_prom",
    header: "Días p/vender",
    width: 1,
    align: "center",
    sortable: true,
    sortValue: (r) => r.dias_prom ?? Number.MAX_SAFE_INTEGER,
    cell: (r) => <span className="text-sm">{r.dias_prom != null ? `${r.dias_prom} d` : "—"}</span>,
  },
  {
    key: "ultima_venta",
    header: "Última venta",
    width: 1,
    align: "center",
    sortable: true,
    sortValue: (r) => r.ultima_venta ?? "",
    cell: (r) => <span className="text-xs text-[#41454d]">{r.ultima_venta ?? "—"}</span>,
  },
  {
    key: "stock_total",
    header: "Stock",
    width: 1,
    align: "center",
    sortable: true,
    sortValue: (r) => r.stock_total,
    cell: (r) => <span className="text-sm">{r.stock_total}</span>,
  },
  {
    key: "cobertura",
    header: "Cobertura",
    width: 1,
    align: "center",
    sortable: true,
    sortValue: (r) => r.cobertura_dias ?? Number.MAX_SAFE_INTEGER,
    cell: (r) => {
      const { dot, title } = coberturaDot(r.cobertura_dias);
      return (
        <div className="flex items-center justify-center gap-1.5" title={title}>
          <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
          <span className="text-xs text-[#41454d]">{r.cobertura_dias != null ? `${r.cobertura_dias}d` : "—"}</span>
        </div>
      );
    },
  },
  {
    key: "descuento",
    header: "Dto.",
    width: 1,
    align: "center",
    sortable: true,
    sortValue: (r) => r.descuento,
    cell: (r) => <DiscountBadge value={r.descuento} />,
  },
];

const rezagadoColumns: ColDef<ProductoAnalisisRow>[] = [
  codigoCol,
  marcaCol,
  modeloCol,
  {
    key: "unidades_viejas",
    header: "Uds. viejas",
    width: 1,
    align: "center",
    sortable: true,
    sortValue: (r) => r.unidades_viejas,
    cell: (r) => (
      <span className="rounded-md bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
        {r.unidades_viejas}
      </span>
    ),
  },
  {
    key: "dias_primer_ingreso",
    header: "Más viejo",
    width: 1,
    align: "center",
    sortable: true,
    sortValue: (r) => r.dias_primer_ingreso ?? -1,
    cell: (r) => <span className="text-sm">{r.dias_primer_ingreso != null ? `${r.dias_primer_ingreso} d` : "—"}</span>,
  },
  {
    key: "stock_total",
    header: "Stock",
    width: 1,
    align: "center",
    sortable: true,
    sortValue: (r) => r.stock_total,
    cell: (r) => <span className="text-sm">{r.stock_total}</span>,
  },
  {
    key: "vendido_90d",
    header: "Vendidas 90d",
    width: 1,
    align: "center",
    sortable: true,
    sortValue: (r) => r.vendido_90d,
    cell: (r) => {
      const { cls, title } = rezagoVentaColor(r.vendido_90d, r.unidades_viejas);
      return (
        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${cls}`} title={title}>
          {r.vendido_90d}
        </span>
      );
    },
  },
  {
    key: "ultima_venta",
    header: "Última venta",
    width: 1,
    align: "center",
    sortable: true,
    sortValue: (r) => r.ultima_venta ?? "",
    cell: (r) => <span className="text-xs text-[#41454d]">{r.ultima_venta ?? "—"}</span>,
  },
];

function muertoColumns(salud: Map<string, SaludInfo>): ColDef<ProductoAnalisisRow>[] {
  return [
    codigoCol,
    marcaCol,
    modeloCol,
    {
      key: "salud",
      header: "Diagnóstico",
      width: 2,
      cell: (r) => {
        const s = salud.get(rowKey(r));
        if (!s) return null;
        return (
          <div className="flex items-center gap-2" title={s.accion}>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} />
            <span className="text-xs text-[#181d26]">{s.label}</span>
          </div>
        );
      },
    },
    {
      key: "dias_ultimo_ingreso",
      header: "Sin reponer",
      width: 1,
      align: "center",
      sortable: true,
      sortValue: (r) => r.dias_ultimo_ingreso ?? -1,
      cell: (r) => (
        <span className="text-sm">{r.dias_ultimo_ingreso != null ? `${r.dias_ultimo_ingreso} d` : "—"}</span>
      ),
    },
    {
      key: "ultima_venta",
      header: "Última venta",
      width: 1,
      align: "center",
      sortable: true,
      sortValue: (r) => r.ultima_venta ?? "",
      cell: (r) => <span className="text-xs text-[#41454d]">{r.ultima_venta ?? "nunca"}</span>,
    },
    {
      key: "stock_total",
      header: "Stock",
      width: 1,
      align: "center",
      sortable: true,
      sortValue: (r) => r.stock_total,
      cell: (r) => <span className="text-sm font-medium">{r.stock_total}</span>,
    },
    {
      key: "descuento",
      header: "Dto.",
      width: 1,
      align: "center",
      sortable: true,
      sortValue: (r) => r.descuento,
      cell: (r) => <DiscountBadge value={r.descuento} />,
    },
  ];
}

const tendenciaColumns: ColDef<MesRow>[] = [
  {
    key: "mes",
    header: "Mes",
    width: 1,
    sortable: true,
    sortValue: (r) => r.mes,
    cell: (r) => <span className="text-sm font-medium text-[#181d26]">{r.mes}</span>,
  },
  {
    key: "unidades",
    header: "Unidades",
    width: 1,
    align: "right",
    sortable: true,
    sortValue: (r) => r.unidades,
    cell: (r) => <span className="text-sm">{r.unidades.toLocaleString("es-PE")}</span>,
  },
  {
    key: "importe",
    header: "Importe",
    width: 1,
    align: "right",
    sortable: true,
    sortValue: (r) => r.importe,
    cell: (r) => <span className="text-sm">{soles(r.importe)}</span>,
  },
];

const rankingColumns: ColDef<ModeloRankingRow>[] = [
  {
    key: "marca",
    header: "Marca",
    width: 1,
    sortable: true,
    sortValue: (r) => r.marca ?? "",
    cell: (r) => <span className="text-sm">{r.marca ?? "—"}</span>,
  },
  {
    key: "modelo",
    header: "Modelo",
    width: 2,
    sortable: true,
    sortValue: (r) => r.modelo ?? "",
    cell: (r) => <span className="text-sm font-medium text-[#181d26]">{r.modelo ?? "—"}</span>,
  },
  {
    key: "genero",
    header: "Género",
    width: 1,
    sortable: true,
    sortValue: (r) => r.genero ?? "",
    cell: (r) => <span className="text-sm">{r.genero ?? "—"}</span>,
  },
  {
    key: "categoria",
    header: "Categoría",
    width: 1,
    sortable: true,
    sortValue: (r) => r.categoria ?? "",
    cell: (r) => <span className="text-sm">{r.categoria ?? "—"}</span>,
  },
  {
    key: "unidades",
    header: "Vendidas",
    width: 1,
    align: "center",
    sortable: true,
    sortValue: (r) => r.unidades,
    cell: (r) => (
      <span className="rounded-md bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
        {r.unidades.toLocaleString("es-PE")}
      </span>
    ),
  },
  {
    key: "importe",
    header: "Importe",
    width: 1,
    align: "right",
    sortable: true,
    sortValue: (r) => r.importe,
    cell: (r) => <span className="text-sm">{soles(r.importe)}</span>,
  },
];

// ─── Sub-components ─────────────────────────────────────────────────────────────

// Banner de interpretación al inicio de cada tab.
function TabInfo({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex gap-2 rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-xs leading-relaxed text-[#41454d]">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
      <div>{children}</div>
    </div>
  );
}

function Kpi({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className={small ? "text-sm font-semibold text-[#181d26]" : "text-2xl font-bold text-[#181d26]"}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-500">{label}</p>
    </div>
  );
}

function VentasDialog({
  open,
  setOpen,
  router,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar ventas</DialogTitle>
        </DialogHeader>
        {open && <VentasUploadForm onSuccess={() => router.refresh()} />}
      </DialogContent>
    </Dialog>
  );
}
