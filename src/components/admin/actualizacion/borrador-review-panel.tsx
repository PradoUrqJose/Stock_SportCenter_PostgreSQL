"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type ColDef } from "@/components/ui/data-table";
import { DiscountBadge } from "@/components/ui/discount-badge";
import { publicarLote } from "@/lib/actions/descuentos";

export type BorradorLineaRow = {
  cod_universal: string;
  genero: string;
  snap_marca: string | null;
  snap_modelo: string | null;
  snap_categoria: string | null;
  snap_color: string | null;
  snap_precio_lista: number | null;
  descuento_antes: number;
  descuento_nuevo: number;
};

function rowKey(r: { cod_universal: string; genero: string }) {
  return `${r.cod_universal}|${r.genero}`;
}

type Props = {
  loteId: number;
  createdAt: string;
  lineas: BorradorLineaRow[];
  headerExtra?: React.ReactNode;
};

export function BorradorReviewPanel({ loteId, createdAt, lineas, headerExtra }: Props) {
  const router = useRouter();
  const [publishOpen, setPublishOpen] = useState(false);

  const columns: ColDef<BorradorLineaRow>[] = [
    {
      key: "cod_universal",
      header: "Cod. Universal",
      sortable: true,
      width: 1,
      sortValue: (r) => r.cod_universal,
      cell: (r) => <span className="font-mono text-xs text-[#181d26]">{r.cod_universal}</span>,
    },
    {
      key: "genero",
      header: "Género",
      sortable: true,
      width: 1,
      sortValue: (r) => r.genero,
      cell: (r) => <Badge variant="outline">{r.genero}</Badge>,
    },
    {
      key: "marca",
      header: "Marca",
      sortable: true,
      width: 1,
      sortValue: (r) => r.snap_marca ?? "",
      cell: (r) => <span className="text-sm">{r.snap_marca ?? "—"}</span>,
    },
    {
      key: "modelo",
      header: "Modelo",
      sortable: true,
      width: 2,
      sortValue: (r) => r.snap_modelo ?? "",
      cell: (r) => <span className="text-sm">{r.snap_modelo ?? "—"}</span>,
    },
    {
      key: "categoria",
      header: "Categoría",
      sortable: true,
      width: 1,
      sortValue: (r) => r.snap_categoria ?? "",
      cell: (r) => <span className="text-sm">{r.snap_categoria ?? "—"}</span>,
    },
    {
      key: "color",
      header: "Color",
      sortable: true,
      width: 1,
      sortValue: (r) => r.snap_color ?? "",
      cell: (r) => <span className="text-sm">{r.snap_color ?? "—"}</span>,
    },
    {
      key: "precio_lista",
      header: "P. Lista",
      align: "right",
      width: 1,
      sortable: true,
      sortValue: (r) => r.snap_precio_lista ?? 0,
      cell: (r) =>
        r.snap_precio_lista ? (
          <span className="text-sm">S/ {r.snap_precio_lista.toFixed(2)}</span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: "descuento",
      header: "Descuento",
      align: "center",
      width: 2,
      cell: (r) => (
        <div className="flex items-center justify-center gap-1.5">
          <DiscountBadge value={r.descuento_antes} />
          <span className="text-[#bbb]">→</span>
          <DiscountBadge value={r.descuento_nuevo} />
        </div>
      ),
    },
    {
      key: "precio_final",
      header: "P. Final",
      align: "right",
      width: 1,
      cell: (r) => {
        const final = (r.snap_precio_lista ?? 0) * (1 - r.descuento_nuevo / 100);
        return r.snap_precio_lista ? (
          <span className="text-sm font-medium">S/ {final.toFixed(2)}</span>
        ) : (
          <span className="text-gray-400">—</span>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-[#181d26]">Registro de cambios</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-800">
            <span>
              {`Borrador #${loteId} — ${lineas.length} producto(s) para revisar · creado ${new Date(
                createdAt
              ).toLocaleDateString("es-PE")}`}
            </span>
            <Button
              size="xs"
              variant="outline"
              onClick={() => router.push("/admin/actualizacion")}
              className="border-amber-300 text-amber-800 hover:bg-amber-100"
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar borrador
            </Button>
            <Button
              size="xs"
              onClick={() => setPublishOpen(true)}
              className="bg-green-600 hover:bg-green-700"
            >
              <Send className="h-3.5 w-3.5" />
              Publicar lote
            </Button>
          </div>
          {headerExtra}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={lineas}
        keyFn={rowKey}
        defaultSort={{ key: "marca", dir: "asc" }}
        pageSize={50}
        emptyTitle="Sin líneas"
        emptyDesc="El borrador no tiene productos."
      />

      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title={`Publicar lote #${loteId}`}
        description={
          <>
            Se enviarán <strong>{lineas.length}</strong> producto
            {lineas.length === 1 ? "" : "s"} a confirmación en todas las tiendas con stock. Una
            vez publicado, los cambios de descuento quedarán congelados hasta que el lote se
            cierre.
          </>
        }
        confirmLabel="Publicar lote"
        onConfirm={() => publicarLote(loteId)}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
