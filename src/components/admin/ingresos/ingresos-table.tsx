"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type ColDef } from "@/components/ui/data-table";
import { FilterBar, type SelectFilterDef } from "@/components/ui/filter-bar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IngresosUploadForm } from "@/components/admin/upload/ingresos-upload-form";
import { SincronizarButton } from "@/components/admin/sincronizar-button";
import type { IngresoRow } from "@/app/admin/ingresos/page";

function money(v: number | null): string {
  return v == null ? "—" : `S/ ${v.toFixed(2)}`;
}

const COLUMNS: ColDef<IngresoRow>[] = [
  {
    key: "codigo_interno",
    header: "Código",
    width: 1,
    sortable: true,
    sortValue: (r) => r.codigo_interno,
    cell: (r) => <span className="font-mono text-xs text-foreground">{r.codigo_interno}</span>,
  },
  {
    key: "emision",
    header: "Emisión",
    width: 1,
    sortable: true,
    sortValue: (r) => r.emision,
    cell: (r) => <span className="text-sm">{r.emision}</span>,
  },
  {
    key: "serie_numero",
    header: "Serie-Número",
    width: 1.5,
    sortable: true,
    sortValue: (r) => r.serie_numero ?? "",
    cell: (r) => <span className="text-sm">{r.serie_numero ?? "—"}</span>,
  },
  {
    key: "almacen",
    header: "Almacén",
    width: 1,
    sortable: true,
    sortValue: (r) => r.almacen ?? "",
    cell: (r) => <span className="text-sm">{r.almacen ?? "—"}</span>,
  },
  {
    key: "proveedor",
    header: "Proveedor",
    width: 2.5,
    sortable: true,
    sortValue: (r) => r.proveedor ?? "",
    cell: (r) => <span className="text-sm">{r.proveedor ?? "—"}</span>,
  },
  {
    key: "ruc",
    header: "RUC",
    width: 1,
    sortable: true,
    sortValue: (r) => r.ruc ?? "",
    cell: (r) => <span className="font-mono text-xs">{r.ruc ?? "—"}</span>,
  },
  {
    key: "subtotal",
    header: "Subtotal",
    width: 1,
    align: "right",
    sortable: true,
    sortValue: (r) => r.subtotal ?? 0,
    cell: (r) => <span className="text-sm">{money(r.subtotal)}</span>,
  },
  {
    key: "igv",
    header: "IGV",
    width: 1,
    align: "right",
    sortable: true,
    sortValue: (r) => r.igv ?? 0,
    cell: (r) => <span className="text-sm">{money(r.igv)}</span>,
  },
  {
    key: "total",
    header: "Total",
    width: 1,
    align: "right",
    sortable: true,
    sortValue: (r) => r.total ?? 0,
    cell: (r) => <span className="text-sm font-medium text-foreground">{money(r.total)}</span>,
  },
];

const FILTERS: SelectFilterDef<IngresoRow>[] = [
  { key: "proveedor", label: "Proveedor", getValue: (r) => r.proveedor },
  { key: "almacen", label: "Almacén", getValue: (r) => r.almacen },
  { key: "moneda", label: "Moneda", getValue: (r) => r.moneda },
];

export function IngresosTable({ ingresos }: { ingresos: IngresoRow[] }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const router = useRouter();

  return (
    <div>
      <FilterBar
        data={ingresos}
        filters={FILTERS}
        searchPlaceholder="Buscar por código, proveedor o RUC…"
        getSearchText={(r) => `${r.codigo_interno} ${r.proveedor ?? ""} ${r.ruc ?? ""} ${r.serie_numero ?? ""}`}
        actions={
          <>
            <SincronizarButton />
            <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4" />
              Cargar histórico
            </Button>
          </>
        }
      >
        {(filtered) => (
          <DataTable
            columns={COLUMNS}
            data={filtered}
            keyFn={(r) => r.codigo_interno}
            defaultSort={{ key: "emision", dir: "desc" }}
            pageSize={50}
            emptyTitle="Sin ingresos cargados"
            emptyDesc='Usa "Cargar histórico" para subir un archivo, o "Sincronizar" para traer del ERP.'
          />
        )}
      </FilterBar>

      <Dialog open={uploadOpen} onOpenChange={(open) => { if (!open) setUploadOpen(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cargar histórico de ingresos</DialogTitle>
          </DialogHeader>
          {uploadOpen && (
            <IngresosUploadForm onSuccess={() => { router.refresh(); }} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
