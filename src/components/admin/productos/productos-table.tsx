"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type ColDef } from "@/components/ui/data-table";
import { DiscountBadge } from "@/components/ui/discount-badge";
import { FilterBar, type SelectFilterDef } from "@/components/ui/filter-bar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UploadForm } from "@/components/admin/upload/upload-form";
import type { ProductoRow } from "@/app/admin/productos/page";

function precioConDescuento(r: ProductoRow): number {
  return r.precio_lista * (1 - r.descuento / 100);
}

const COLUMNS: ColDef<ProductoRow>[] = [
  {
    key: "cod_universal",
    header: "Código",
    width: 1,
    sortable: true,
    sortValue: (r) => r.cod_universal,
    cell: (r) => (
      <span className="font-mono text-xs text-foreground">{r.cod_universal}</span>
    ),
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
    key: "grupo",
    header: "Grupo",
    width: 1.5,
    sortable: true,
    sortValue: (r) => r.grupo ?? "",
    cell: (r) => <span className="text-sm">{r.grupo ?? "—"}</span>,
  },
  {
    key: "modelo",
    header: "Modelo",
    width: 2.5,
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
    key: "color",
    header: "Color",
    width: 1,
    sortable: true,
    sortValue: (r) => r.color ?? "",
    cell: (r) => <span className="text-sm">{r.color ?? "—"}</span>,
  },
  {
    key: "precio_lista",
    header: "Precio lista",
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
    header: "Descuento",
    width: 1,
    align: "center",
    sortable: true,
    sortValue: (r) => r.descuento,
    cell: (r) => <DiscountBadge value={r.descuento} />,
  },
  {
    key: "precio_con_descuento",
    header: "Precio dto",
    width: 1,
    align: "center",
    sortable: true,
    sortValue: (r) => precioConDescuento(r),
    cell: (r) =>
      r.precio_lista > 0 ? (
        <span className="text-sm font-medium text-foreground">
          S/ {precioConDescuento(r).toFixed(2)}
        </span>
      ) : (
        <span className="text-gray-400">—</span>
      ),
  },
  {
    key: "stock_total",
    header: "Stock",
    width: 1,
    align: "center",
    sortable: true,
    sortValue: (r) => r.stock_total,
    cell: (r) => (
      <span className="text-sm font-medium">{r.stock_total}</span>
    ),
  },
];

const FILTERS: SelectFilterDef<ProductoRow>[] = [
  { key: "categoria", label: "Categoría", getValue: (r) => r.categoria },
  { key: "marca", label: "Marca", getValue: (r) => r.marca },
  { key: "color", label: "Color", getValue: (r) => r.color },
  {
    key: "descuento",
    label: "Descuento",
    getValue: (r) => (r.descuento > 0 ? String(r.descuento) : "0"),
    formatOption: (v) => (v === "0" ? "Sin descuento" : `${v}%`),
  },
];

export function ProductosTable({ productos }: { productos: ProductoRow[] }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const router = useRouter();

  return (
    <div>
      <FilterBar
        data={productos}
        filters={FILTERS}
        searchPlaceholder="Buscar por código, marca o modelo…"
        getSearchText={(r) => `${r.cod_universal} ${r.marca ?? ""} ${r.modelo ?? ""}`}
        actions={
          <>
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4" />
              Actualizar stock
            </Button>
          </>
        }
      >
        {(filtered) => (
          <DataTable
            columns={COLUMNS}
            data={filtered}
            keyFn={(r) => `${r.cod_universal}|${r.genero}`}
            defaultSort={{ key: "marca", dir: "asc" }}
            pageSize={50}
            emptyTitle="Sin productos cargados"
            emptyDesc='Usa el botón "Actualizar stock" para subir el archivo del ERP.'
          />
        )}
      </FilterBar>

      <Dialog open={uploadOpen} onOpenChange={(open) => { if (!open) setUploadOpen(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Actualizar stock</DialogTitle>
          </DialogHeader>
          {uploadOpen && (
            <UploadForm onSuccess={() => { router.refresh(); }} />
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
