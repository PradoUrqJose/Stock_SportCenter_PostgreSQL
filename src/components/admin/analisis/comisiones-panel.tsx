"use client";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, RefreshCw, FileSpreadsheet, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type ColDef } from "@/components/ui/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sincronizarComisiones } from "@/lib/actions/comisiones";
import { DESCUENTOS_COMISION, ENCABEZADO_OSCURO, ESTILO_ENCABEZADO_PROMOCION } from "@/lib/comisiones";
import type { PromocionUsuarioRow, TotalUsuarioRow } from "@/lib/queries/comisiones";

function Controles({ inicioInicial, finInicial }: { inicioInicial: string; finInicial: string }) {
  const [inicio, setInicio] = useState(inicioInicial),
    [fin, setFin] = useState(finInicial),
    [cargando, setCargando] = useState(false);
  const router = useRouter(),
    path = usePathname();
  const consultar = () => router.push(`${path}?inicio=${inicio}&fin=${fin}`);
  async function sync() {
    setCargando(true);
    try {
      const r = await sincronizarComisiones(inicio, fin);
      if (!r.success) alert(r.msg);
      else consultar();
    } finally {
      setCargando(false);
    }
  }
  return (
    <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
      <label className="text-sm">
        Inicio
        <input className="mt-1 block rounded-md border px-2 py-1.5" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
      </label>
      <label className="text-sm">
        Fin
        <input className="mt-1 block rounded-md border px-2 py-1.5" type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
      </label>
      <Button onClick={consultar} disabled={!inicio || !fin || cargando}>
        <Search className="h-4 w-4" />
        Consultar período
      </Button>
      <Button variant="outline" onClick={sync} disabled={!inicio || !fin || cargando}>
        {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Sincronizar ERP
      </Button>
    </div>
  );
}
const promoCols: ColDef<PromocionUsuarioRow>[] = [
  { key: "usuario", header: "Vendedor", sortable: true, sortValue: (r) => r.usuario, cell: (r) => r.usuario, headerClassName: ENCABEZADO_OSCURO.web },
  ...DESCUENTOS_COMISION.map((descuento) => ({
    key: `d${descuento}` as const,
    header: `${descuento}%`,
    align: "center" as const,
    sortable: true,
    sortValue: (r: PromocionUsuarioRow) => r[`d${descuento}`],
    cell: (r: PromocionUsuarioRow) => r[`d${descuento}`],
    headerClassName: ESTILO_ENCABEZADO_PROMOCION[descuento].web,
  })),
  { key: "total_general", header: "Total general", align: "center", sortable: true, sortValue: (r) => r.total_general, cell: (r) => r.total_general, headerClassName: ENCABEZADO_OSCURO.web },
];
const totalCols: ColDef<TotalUsuarioRow>[] = [
  { key: "usuario", header: "Usuario", sortable: true, sortValue: (r) => r.usuario, cell: (r) => r.usuario },
  { key: "cantidad", header: "Ventas", align: "center", sortable: true, sortValue: (r) => r.cantidad, cell: (r) => r.cantidad },
  { key: "monto", header: "Monto total", align: "right", sortable: true, sortValue: (r) => r.monto, cell: (r) => `S/ ${r.monto.toFixed(2)}` },
];
export function ComisionesPanel({ inicio, fin, promociones, totales }: { inicio: string; fin: string; promociones: PromocionUsuarioRow[]; totales: TotalUsuarioRow[] }) {
  const qs = `inicio=${inicio}&fin=${fin}`;
  return (
    <>
      <Controles inicioInicial={inicio} finInicial={fin} />
      <Tabs defaultValue="promociones">
        <TabsList>
          <TabsTrigger value="promociones">Promociones</TabsTrigger>
          <TabsTrigger value="totales">Ventas totales</TabsTrigger>
        </TabsList>
        <TabsContent value="promociones">
          <div className="mb-3 flex justify-end">
            <a href={`/api/export/comisiones/promociones?${qs}`} className="inline-flex items-center gap-2 text-sm font-medium underline">
              <FileSpreadsheet className="h-4 w-4" />
              Exportar Excel
            </a>
          </div>
          <DataTable columns={promoCols} data={promociones} keyFn={(r) => r.usuario} defaultSort={{ key: "total_general", dir: "desc" }} emptyTitle="Sin ventas con promoción" />
        </TabsContent>
        <TabsContent value="totales">
          <div className="mb-3 flex justify-end">
            <a href={`/api/export/comisiones/totales?${qs}`} className="inline-flex items-center gap-2 text-sm font-medium underline">
              <FileSpreadsheet className="h-4 w-4" />
              Exportar Excel
            </a>
          </div>
          <DataTable columns={totalCols} data={totales} keyFn={(r) => r.usuario} defaultSort={{ key: "monto", dir: "desc" }} emptyTitle="Sin ventas Minorista" />
        </TabsContent>
      </Tabs>
    </>
  );
}
