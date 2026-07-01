"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type ColDef } from "@/components/ui/data-table";
import { ProductImageThumb } from "@/components/ui/product-image-thumb";
import { parseImagenesMasivoFile, type ImagenMasivoRow } from "@/lib/masivo/parsers";
import { subirImagenesMasivoBatch } from "@/lib/actions/utils";

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
  | { id: "preview"; rows: ImagenMasivoRow[] }
  | { id: "uploading"; current: number; total: number }
  | { id: "done"; aplicadas: number }
  | { id: "error"; msg: string };

export function ImagenesMasivoForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ id: "idle" });

  async function handleParse() {
    const file = fileRef.current?.files?.[0];
    if (!file) return alert("Selecciona el archivo (XLSX).");
    setStep({ id: "parsing" });
    try {
      const rows = await parseImagenesMasivoFile(file);
      if (rows.length === 0) throw new Error("No se encontraron filas válidas (código + URL http/https).");
      setStep({ id: "preview", rows });
    } catch (e) {
      setStep({ id: "error", msg: String(e) });
    }
  }

  async function handleUpload(rows: ImagenMasivoRow[]) {
    try {
      const batches = chunkArray(rows, BATCH_SIZE);
      setStep({ id: "uploading", current: 0, total: batches.length });
      for (let i = 0; i < batches.length; i += CONCURRENCY) {
        const group = batches.slice(i, i + CONCURRENCY);
        const results = await Promise.all(group.map((b) => subirImagenesMasivoBatch(b)));
        const failed = results.find((r) => !r.success);
        if (failed) throw new Error(failed.msg);
        setStep({ id: "uploading", current: Math.min(i + CONCURRENCY, batches.length), total: batches.length });
      }
      setStep({ id: "done", aplicadas: rows.length });
      router.refresh();
    } catch (e) {
      setStep({ id: "error", msg: String(e) });
    }
  }

  function reset() {
    setStep({ id: "idle" });
    if (fileRef.current) fileRef.current.value = "";
  }

  const columns: ColDef<ImagenMasivoRow>[] = [
    {
      key: "imagen_url",
      header: "Imagen",
      width: 1,
      align: "center",
      cell: (r) => <ProductImageThumb imagenUrl={r.imagen_url} codigo={r.cod_universal} />,
    },
    {
      key: "cod_universal",
      header: "Cod. Universal",
      width: 1,
      cell: (r) => <span className="font-mono text-xs text-foreground">{r.cod_universal}</span>,
    },
    {
      key: "enlace",
      header: "Enlace de imagen",
      width: 3,
      cell: (r) => (
        <span className="block truncate text-xs text-muted-foreground" title={r.imagen_url}>
          {r.imagen_url}
        </span>
      ),
    },
  ];

  if (step.id === "done") {
    return (
      <div className="rounded-xl border border-green-200 dark:border-green-500/25 bg-green-50 dark:bg-green-500/10 p-6 space-y-3">
        <p className="font-semibold text-green-800 dark:text-green-300">Imágenes aplicadas</p>
        <p className="text-sm text-green-700 dark:text-green-300">
          {step.aplicadas} imagen(es) guardadas en la tabla de imágenes (source: sistema).
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
        <p className="text-sm font-medium text-gray-700">Subiendo imágenes...</p>
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
            {rows.length} imagen(es) listas para aplicar.
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={reset}>Cancelar</Button>
            <Button size="sm" onClick={() => handleUpload(rows)}>Aplicar imágenes</Button>
          </div>
        </div>
        <DataTable
          columns={columns}
          data={rows}
          keyFn={(r) => r.cod_universal}
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
          <label className="text-sm font-medium text-gray-700">Archivo de imágenes (XLSX)</label>
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
            Columnas requeridas: <code>CODE</code> (código universal), <code>ENLACE</code> (URL
            http/https de la imagen).
          </p>
        </div>
        <p className="text-xs text-gray-400">
          Las imágenes se guardan como <code>source=&apos;sistema&apos;</code> y sobreviven al próximo
          upload de stock; se sobreescriben si vuelves a subir el mismo código.
        </p>
      </div>
      <Button onClick={handleParse}>Leer archivo</Button>
    </div>
  );
}
