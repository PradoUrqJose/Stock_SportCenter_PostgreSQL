"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type ColDef } from "@/components/ui/data-table";
import { FilterBar, type SelectFilterDef } from "@/components/ui/filter-bar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FacturacionUploadForm } from "@/components/admin/upload/facturacion-upload-form";
import { SincronizarButton } from "@/components/admin/sincronizar-button";
import type { FacturacionRow } from "@/app/admin/facturacion/page";

function money(v: number | null): string {
  return v == null ? "—" : `S/ ${v.toFixed(2)}`;
}

const COLUMNS: ColDef<FacturacionRow>[] = [
  {
    key: "ser_num",
    header: "N° Documento",
    width: 1.2,
    sortable: true,
    sortValue: (r) => r.ser_num,
    cell: (r) => <span className="font-mono text-xs text-foreground">{r.ser_num}</span>,
  },
  {
    key: "fecha",
    header: "Fecha",
    width: 1,
    sortable: true,
    sortValue: (r) => r.fecha,
    cell: (r) => <span className="text-sm">{r.fecha}</span>,
  },
  {
    key: "tipo_comprobante",
    header: "Comprobante",
    width: 1,
    sortable: true,
    sortValue: (r) => r.tipo_comprobante ?? "",
    cell: (r) => <span className="text-sm">{r.tipo_comprobante ?? "—"}</span>,
  },
  {
    key: "cliente",
    header: "Cliente",
    width: 2.5,
    sortable: true,
    sortValue: (r) => r.cliente ?? "",
    cell: (r) => <span className="text-sm">{r.cliente ?? "—"}</span>,
  },
  {
    key: "tienda",
    header: "Tienda",
    width: 0.7,
    sortable: true,
    sortValue: (r) => r.tienda ?? "",
    cell: (r) => <span className="text-sm">{r.tienda ?? "—"}</span>,
  },
  {
    key: "vendedor",
    header: "Vendedor",
    width: 1.2,
    sortable: true,
    sortValue: (r) => r.vendedor ?? "",
    cell: (r) => <span className="text-sm">{r.vendedor ?? "—"}</span>,
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
    sortValue: (r) => r.total,
    cell: (r) => <span className="text-sm font-medium text-foreground">{money(r.total)}</span>,
  },
];

const FILTERS: SelectFilterDef<FacturacionRow>[] = [
  { key: "tienda", label: "Tienda", getValue: (r) => r.tienda },
  { key: "vendedor", label: "Vendedor", getValue: (r) => r.vendedor },
  { key: "tipo_comprobante", label: "Comprobante", getValue: (r) => r.tipo_comprobante },
];

export function FacturacionTable({ facturacion }: { facturacion: FacturacionRow[] }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const router = useRouter();

  return (
    <div>
      <FilterBar
        data={facturacion}
        filters={FILTERS}
        searchPlaceholder="Buscar por N° documento o cliente…"
        getSearchText={(r) => `${r.ser_num} ${r.cliente ?? ""} ${r.codigo ?? ""}`}
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
            keyFn={(r) => r.ser_num}
            defaultSort={{ key: "fecha", dir: "desc" }}
            pageSize={50}
            emptyTitle="Sin facturación cargada"
            emptyDesc='Usa "Cargar histórico" para subir un archivo, o "Sincronizar" para traer del ERP.'
          />
        )}
      </FilterBar>

      <Dialog open={uploadOpen} onOpenChange={(open) => { if (!open) setUploadOpen(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cargar histórico de facturación</DialogTitle>
          </DialogHeader>
          {uploadOpen && (
            <FacturacionUploadForm onSuccess={() => { router.refresh(); }} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
