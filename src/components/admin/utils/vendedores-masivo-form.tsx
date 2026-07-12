"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type ColDef } from "@/components/ui/data-table";
import { parseVendedoresMasivoFile, type VendedorMasivoRow } from "@/lib/masivo/parsers";
import { crearVendedoresMasivoBatch } from "@/lib/actions/utils";

const BATCH_SIZE = 500;
const CONCURRENCY = 3;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type Step =
  | { id: "idle" }
  | { id: "parsing" }
  | { id: "preview"; rows: VendedorMasivoRow[] }
  | { id: "uploading"; current: number; total: number }
  | { id: "done"; creados: number; duplicados: number }
  | { id: "error"; msg: string };

export function VendedoresMasivoForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ id: "idle" });

  async function handleParse() {
    const file = fileRef.current?.files?.[0];
    if (!file) return alert("Selecciona el archivo (XLSX).");
    setStep({ id: "parsing" });
    try {
      const rows = await parseVendedoresMasivoFile(file);
      if (rows.length === 0) throw new Error("No se encontraron filas válidas (usuario + nombre + credencial).");
      setStep({ id: "preview", rows });
    } catch (e) {
      setStep({ id: "error", msg: String(e) });
    }
  }

  async function handleUpload(rows: VendedorMasivoRow[]) {
    try {
      const batches = chunkArray(rows, BATCH_SIZE);
      let creados = 0;
      let duplicados = 0;
      setStep({ id: "uploading", current: 0, total: batches.length });
      for (let i = 0; i < batches.length; i += CONCURRENCY) {
        const group = batches.slice(i, i + CONCURRENCY);
        const results = await Promise.all(group.map((b) => crearVendedoresMasivoBatch(b)));
        const failed = results.find((r) => !r.success);
        if (failed) throw new Error(failed.msg);
        for (const r of results) {
          creados += r.data?.creados ?? 0;
          duplicados += r.data?.duplicados ?? 0;
        }
        setStep({ id: "uploading", current: Math.min(i + CONCURRENCY, batches.length), total: batches.length });
      }
      setStep({ id: "done", creados, duplicados });
      router.refresh();
    } catch (e) {
      setStep({ id: "error", msg: String(e) });
    }
  }

  function reset() {
    setStep({ id: "idle" });
    if (fileRef.current) fileRef.current.value = "";
  }

  const columns: ColDef<VendedorMasivoRow>[] = [
    {
      key: "usuario",
      header: "Usuario",
      width: 1,
      cell: (r) => <span className="text-sm text-muted-foreground">{r.usuario}</span>,
    },
    {
      key: "codigo",
      header: "Credencial",
      width: 1,
      cell: (r) => <span className="font-mono text-xs text-foreground">{r.codigo}</span>,
    },
    {
      key: "nombre",
      header: "Nombre",
      width: 2,
      cell: (r) => <span className="text-sm text-foreground">{r.nombre}</span>,
    },
    {
      key: "activo",
      header: "Estado",
      width: 1,
      align: "center",
      cell: (r) =>
        r.activo ? (
          <Badge variant="outline">Activo</Badge>
        ) : (
          <Badge variant="secondary">Inactivo</Badge>
        ),
    },
  ];

  if (step.id === "done") {
    return (
      <div className="rounded-xl border border-green-200 dark:border-green-500/25 bg-green-50 dark:bg-green-500/10 p-6 space-y-3">
        <p className="font-semibold text-green-800 dark:text-green-300">Credenciales creadas</p>
        <p className="text-sm text-green-700 dark:text-green-300">
          {step.creados} credencial(es) nueva(s)
          {step.duplicados > 0 ? `, ${step.duplicados} código(s) ya existían y se omitieron` : ""}.
        </p>
        <Button variant="outline" size="sm" onClick={reset}>Nueva carga</Button>
      </div>
    );
  }

  if (step.id === "error") {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10 p-6 space-y-3">
        <p className="font-semibold text-red-800 dark:text-red-300">Error</p>
        <p className="text-sm font-mono text-red-700 dark:text-red-300">{step.msg}</p>
        <Button variant="outline" size="sm" onClick={reset}>Reintentar</Button>
      </div>
    );
  }

  if (step.id === "parsing") {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border bg-card p-6 text-center text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Leyendo archivo...
      </div>
    );
  }

  if (step.id === "uploading") {
    const pct = step.total > 0 ? Math.round((step.current / step.total) * 100) : 0;
    return (
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <p className="text-sm font-medium text-gray-700">Creando credenciales...</p>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-2 rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-gray-400 text-right">{step.current} / {step.total} lotes</p>
      </div>
    );
  }

  if (step.id === "preview") {
    const { rows } = step;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <span className="text-sm text-muted-foreground">
            {rows.length} credencial(es) lista(s) para crear. Se crean sin tienda asignada.
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={reset}>Cancelar</Button>
            <Button size="sm" onClick={() => handleUpload(rows)}>Crear credenciales</Button>
          </div>
        </div>
        <DataTable
          columns={columns}
          data={rows}
          keyFn={(r) => r.codigo}
          pageSize={50}
          emptyTitle="Sin filas"
        />
      </div>
    );
  }

  // idle
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Archivo de vendedores (XLSX)</label>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="block w-full text-sm text-gray-600
              file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0
              file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700
              hover:file:bg-gray-200 cursor-pointer"
          />
          <p className="text-xs text-gray-400">
            Columnas requeridas: <code>Usuario</code>, <code>Nombre</code>, <code>Credencial</code>.
            Columna opcional: <code>Activo</code> (poner &quot;INACTIVO&quot; para crearlo desactivado;
            cualquier otro valor o la columna ausente lo crea activo).
          </p>
        </div>
        <p className="text-xs text-gray-400">
          Las credenciales se crean sin tienda asociada: quedan válidas para confirmar/rechazar en
          cualquier tienda hasta que se les asigne una desde{" "}
          <span className="font-medium">Credenciales de Vendedores</span>. Los códigos duplicados
          (ya existentes) se omiten.
        </p>
      </div>
      <Button onClick={handleParse}>Leer archivo</Button>
    </div>
  );
}
