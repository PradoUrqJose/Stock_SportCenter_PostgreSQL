"use client";

import { useState, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { parseVentasFile } from "@/lib/upload/parsers";
import { clearVentas, uploadVentasBatch, finalizeVentasUpload } from "@/lib/actions/upload";
import type { VentaInsert } from "@/lib/upload/types";

const BATCH_SIZE = 500;
// sequential — concurrent writers against the local SQLite file raise SQLITE_BUSY at this row volume
const CONCURRENCY = 1;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type Step =
  | { id: "idle" }
  | { id: "parsing" }
  | { id: "preview"; rows: VentaInsert[] }
  | { id: "uploading"; label: string; current: number; total: number }
  | { id: "done"; filas: number }
  | { id: "error"; msg: string };

export function VentasUploadForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [step, setStep] = useState<Step>({ id: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleParse() {
    const file = fileRef.current?.files?.[0];
    if (!file) return alert("Selecciona el archivo de ventas (XLSX).");
    setStep({ id: "parsing" });
    try {
      const rows = await parseVentasFile(file);
      setStep({ id: "preview", rows });
    } catch (e) {
      setStep({ id: "error", msg: String(e) });
    }
  }

  async function handleUpload(rows: VentaInsert[]) {
    try {
      setStep({ id: "uploading", label: "Limpiando ventas anteriores...", current: 0, total: 0 });
      const clear = await clearVentas();
      if (!clear.success) throw new Error(clear.msg);

      const batches = chunkArray(rows, BATCH_SIZE);
      let done = 0;
      for (let i = 0; i < batches.length; i += CONCURRENCY) {
        const group = batches.slice(i, i + CONCURRENCY);
        const results = await Promise.all(group.map((b) => uploadVentasBatch(b)));
        const failed = results.find((r) => !r.success);
        if (failed) throw new Error(failed.msg);
        done = Math.min(i + CONCURRENCY, batches.length);
        setStep({ id: "uploading", label: "Subiendo ventas", current: done, total: batches.length });
      }

      setStep({ id: "uploading", label: "Finalizando...", current: 0, total: 0 });
      const fin = await finalizeVentasUpload(rows.length);
      if (!fin.success) throw new Error(fin.msg);

      setStep({ id: "done", filas: rows.length });
      onSuccess?.();
    } catch (e) {
      setStep({ id: "error", msg: String(e) });
    }
  }

  function reset() {
    setStep({ id: "idle" });
    if (fileRef.current) fileRef.current.value = "";
  }

  if (step.id === "done") {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 space-y-4">
        <p className="font-semibold text-green-800">Import completado</p>
        <p className="text-2xl font-bold text-green-900">{step.filas.toLocaleString()}</p>
        <p className="text-xs text-green-700">ventas importadas</p>
        <Button variant="outline" size="sm" onClick={reset}>Nueva carga</Button>
      </div>
    );
  }

  if (step.id === "error") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 space-y-3">
        <p className="font-semibold text-red-800">Error durante el import</p>
        <p className="text-sm text-red-700 font-mono">{step.msg}</p>
        <Button variant="outline" size="sm" onClick={reset}>Reintentar</Button>
      </div>
    );
  }

  if (step.id === "parsing") {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border bg-white p-6 text-center text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Leyendo archivo...
      </div>
    );
  }

  if (step.id === "uploading") {
    const pct = step.total > 0 ? Math.round((step.current / step.total) * 100) : null;
    return (
      <div className="rounded-xl border bg-white p-6 space-y-4">
        <p className="text-sm font-medium text-gray-700">{step.label}</p>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-2 rounded-full bg-blue-500 transition-all duration-300"
            style={{ width: pct != null ? `${pct}%` : "100%" }}
          />
        </div>
        {pct != null && (
          <p className="text-xs text-gray-400 text-right">{step.current} / {step.total} lotes</p>
        )}
      </div>
    );
  }

  if (step.id === "preview") {
    const { rows } = step;
    const minDate = rows.reduce((a, r) => r.fecha_venta < a ? r.fecha_venta : a, rows[0]?.fecha_venta ?? "");
    const maxDate = rows.reduce((a, r) => r.fecha_venta > a ? r.fecha_venta : a, rows[0]?.fecha_venta ?? "");
    return (
      <div className="space-y-4">
        <div className="rounded-xl border bg-white p-6 space-y-3">
          <p className="font-medium text-gray-800">Archivo leído correctamente</p>
          <p className="text-2xl font-bold text-gray-900">{rows.length.toLocaleString()}</p>
          <p className="text-xs text-gray-500">
            líneas de venta · {minDate} → {maxDate}
          </p>
          <p className="text-xs text-gray-400">
            Se borrarán todas las ventas anteriores y se reemplazarán con estas.
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => handleUpload(rows)}>Importar ventas</Button>
          <Button variant="outline" onClick={reset}>Cancelar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-5 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-gray-700">
            Reporte de ventas (XLSX) <span className="text-red-500">*</span>
          </Label>
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
            Columnas requeridas: código de barras, fecha, cantidad. Opcional: importe.
          </p>
        </div>
      </div>
      <Button onClick={handleParse}>Leer archivo</Button>
    </div>
  );
}
