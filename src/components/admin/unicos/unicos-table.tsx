"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type ColDef } from "@/components/ui/data-table";
import { DiscountBadge } from "@/components/ui/discount-badge";
import { FilterBar, type SelectFilterDef } from "@/components/ui/filter-bar";
import type { UnicoRow } from "@/lib/queries/unicos";

const rowKey = (r: UnicoRow) => `${r.cod_universal}|${r.genero}`;

function tiendas(r: UnicoRow): string[] {
  return [...new Set([r.alm_izq, r.alm_der].filter(Boolean) as string[])];
}

const FILTERS: SelectFilterDef<UnicoRow>[] = [
  { key: "tienda", label: "Tienda", getValues: (r) => tiendas(r) },
  { key: "marca", label: "Marca", getValue: (r) => r.marca },
  { key: "categoria", label: "Categoría", getValue: (r) => r.categoria },
  { key: "color", label: "Color", getValue: (r) => r.color },
];

const COLUMNS: ColDef<UnicoRow>[] = [
  {
    key: "cod_universal",
    header: "Código",
    width: 1,
    sortable: true,
    sortValue: (r) => r.cod_universal,
    cell: (r) => <span className="font-mono text-xs text-foreground">{r.cod_universal}</span>,
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
    key: "genero",
    header: "Género",
    width: 1,
    sortable: true,
    sortValue: (r) => r.genero,
    cell: (r) => <Badge variant="outline">{r.genero}</Badge>,
  },
  {
    key: "talla",
    header: "Talla",
    width: 1,
    align: "center",
    sortable: true,
    sortValue: (r) => r.talla ?? "",
    cell: (r) => <span className="text-sm">{r.talla ?? "—"}</span>,
  },
  {
    key: "color",
    header: "Color",
    width: 1,
    sortable: true,
    sortValue: (r) => r.color ?? "",
    cell: (r) => <span className="text-sm">{r.color ?? "—"}</span>,
  },
  {
    key: "tienda",
    header: "Tienda",
    width: 1,
    align: "center",
    sortable: true,
    sortValue: (r) => tiendas(r).join("/"),
    cell: (r) => {
      const t = tiendas(r);
      return t.length > 0 ? (
        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-muted-foreground">{t.join(" / ")}</span>
      ) : (
        <span className="text-gray-400">—</span>
      );
    },
  },
  {
    key: "antiguedad_dias",
    header: "Antigüedad",
    width: 1,
    align: "center",
    sortable: true,
    sortValue: (r) => r.antiguedad_dias ?? -1,
    cell: (r) => <span className="text-sm">{r.antiguedad_dias != null ? `${r.antiguedad_dias} d` : "—"}</span>,
  },
  {
    key: "precio_lista",
    header: "Precio",
    width: 1,
    align: "right",
    sortable: true,
    sortValue: (r) => r.precio_lista,
    cell: (r) =>
      r.precio_lista > 0 ? (
        <span className="text-sm">S/ {r.precio_lista.toFixed(2)}</span>
      ) : (
        <span className="text-gray-400">—</span>
      ),
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

export function UnicosTable({ unicos }: { unicos: UnicoRow[] }) {
  return (
    <FilterBar
      data={unicos}
      filters={FILTERS}
      searchPlaceholder="Buscar por código, marca o modelo…"
      getSearchText={(r) => `${r.cod_universal} ${r.marca ?? ""} ${r.modelo ?? ""}`}
    >
      {(filtered) => (
        <DataTable
          columns={COLUMNS}
          data={filtered}
          keyFn={rowKey}
          defaultSort={{ key: "marca", dir: "asc" }}
          pageSize={50}
          emptyTitle="Sin productos únicos"
          emptyDesc="Ningún producto tiene exactamente una unidad en stock."
        />
      )}
    </FilterBar>
  );
}
