"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type ColDef } from "@/components/ui/data-table";
import { DiscountBadge } from "@/components/ui/discount-badge";
import { FilterBar, type SelectFilterDef } from "@/components/ui/filter-bar";
import { UniversalCodeLink } from "@/components/ui/universal-code-link";
import type { ReponerRow } from "@/lib/queries/reponer";

const FILTERS: SelectFilterDef<ReponerRow>[] = [
  { key: "almacen", label: "Almacén", getValues: (r) => r.almacenes.split(", ") },
  { key: "marca", label: "Marca", getValue: (r) => r.marca },
  { key: "categoria", label: "Categoría", getValue: (r) => r.categoria },
  { key: "genero", label: "Género", getValues: (r) => r.generos.split(", ") },
];

const COLUMNS: ColDef<ReponerRow>[] = [
  {
    key: "prioridad",
    header: "Prioridad",
    width: 1,
    sortable: true,
    sortValue: (r) => (r.stock_total === 1 ? 0 : r.stock_total),
    cell: (r) => r.stock_total === 1
      ? <Badge className="bg-red-600 text-white hover:bg-red-600">Único</Badge>
      : <Badge variant="outline">Reponer</Badge>,
  },
  {
    key: "cod_universal",
    header: "Código",
    width: 1,
    sortable: true,
    sortValue: (r) => r.cod_universal,
    cell: (r) => <UniversalCodeLink codigo={r.cod_universal} />,
  },
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
    cell: (r) => <span className="text-sm">{r.modelo ?? "—"}</span>,
  },
  {
    key: "generos",
    header: "Género",
    width: 1,
    sortable: true,
    sortValue: (r) => r.generos,
    cell: (r) => <span className="text-sm">{r.generos}</span>,
  },
  {
    key: "almacenes",
    header: "Almacén",
    width: 1,
    sortable: true,
    sortValue: (r) => r.almacenes,
    cell: (r) => <span className="text-sm font-medium">{r.almacenes}</span>,
  },
  {
    key: "stock_total",
    header: "Unidades",
    align: "center",
    width: 1,
    sortable: true,
    sortValue: (r) => r.stock_total,
    cell: (r) => <span className={r.stock_total === 1 ? "font-semibold text-red-600" : "font-semibold"}>{r.stock_total}</span>,
  },
  {
    key: "antiguedad_dias",
    header: "Antigüedad",
    align: "center",
    width: 1,
    sortable: true,
    sortValue: (r) => r.antiguedad_dias ?? -1,
    cell: (r) => <span className="text-sm">{r.antiguedad_dias == null ? "—" : `${r.antiguedad_dias} d`}</span>,
  },
  {
    key: "descuento",
    header: "Dto.",
    align: "center",
    width: 1,
    sortable: true,
    sortValue: (r) => r.descuento,
    cell: (r) => <DiscountBadge value={r.descuento} />,
  },
];

export function ReponerTable({ productos }: { productos: ReponerRow[] }) {
  const unicos = productos.filter((p) => p.stock_total === 1).length;
  const unidades = productos.reduce((total, p) => total + p.stock_total, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Resumen etiqueta="Productos por reponer" valor={productos.length} />
        <Resumen etiqueta="Prioridad: únicos" valor={unicos} tono="text-red-600" />
        <Resumen etiqueta="Unidades en almacén" valor={unidades} />
      </div>
      <FilterBar
        data={productos}
        filters={FILTERS}
        searchPlaceholder="Buscar por código, marca o modelo…"
        getSearchText={(r) => `${r.cod_universal} ${r.marca ?? ""} ${r.modelo ?? ""} ${r.generos}`}
      >
        {(filtered) => (
          <DataTable
            columns={COLUMNS}
            data={filtered}
            keyFn={(r) => r.cod_universal}
            defaultSort={{ key: "stock_total", dir: "desc" }}
            pageSize={50}
            emptyTitle="Sin productos por reponer"
            emptyDesc="Todas las unidades del último stock cargado ya están en tiendas, o no hay stock cargado."
          />
        )}
      </FilterBar>
    </div>
  );
}

function Resumen({ etiqueta, valor, tono = "text-foreground" }: { etiqueta: string; valor: number; tono?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className={`mt-1 text-2xl font-semibold ${tono}`}>{valor.toLocaleString("es-PE")}</p>
    </div>
  );
}
