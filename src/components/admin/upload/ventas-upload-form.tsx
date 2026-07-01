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
  | { id: "done"; insertadas: number; total: number; modo: Modo }
  | { id: "error"; msg: string };

type Modo = "agregar" | "reconstruir";

export function VentasUploadForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [step, setStep] = useState<Step>({ id: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleParse() {
    const file = fileRef.current?.files?.[0];
    if (!file) return alert("Selecciona el archivo de ventas (XLSX).");
    setStep({ id: "parsing" });
    try {
      const rows = await parseVentasFile(file);
      if (rows.length === 0) throw new Error("No se encontraron ventas válidas (VEND='S' con fecha).");
      setStep({ id: "preview", rows });
    } catch (e) {
      setStep({ id: "error", msg: String(e) });
    }
  }

  async function handleUpload(rows: VentaInsert[], modo: Modo) {
    try {
      if (modo === "reconstruir") {
        setStep({ id: "uploading", label: "Borrando histórico anterior...", current: 0, total: 0 });
        const clear = await clearVentas();
        if (!clear.success) throw new Error(clear.msg);
      }

      const batches = chunkArray(rows, BATCH_SIZE);
      let insertadas = 0;
      let done = 0;
      for (let i = 0; i < batches.length; i += CONCURRENCY) {
        const group = batches.slice(i, i + CONCURRENCY);
        const results = await Promise.all(group.map((b) => uploadVentasBatch(b)));
        const failed = results.find((r) => !r.success);
        if (failed) throw new Error(failed.msg);
        insertadas += results.reduce((sum, r) => sum + (r.data?.insertadas ?? 0), 0);
        done = Math.min(i + CONCURRENCY, batches.length);
        setStep({ id: "uploading", label: "Subiendo ventas", current: done, total: batches.length });
      }

      setStep({ id: "uploading", label: "Finalizando...", current: 0, total: 0 });
      const fin = await finalizeVentasUpload(rows.length);
      if (!fin.success) throw new Error(fin.msg);

      setStep({ id: "done", insertadas, total: fin.data?.total ?? 0, modo });
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
    const dup = step.insertadas;
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 space-y-4">
        <p className="font-semibold text-green-800">
          {step.modo === "reconstruir" ? "Histórico reconstruido" : "Ventas agregadas"}
        </p>
        <p className="text-2xl font-bold text-green-900">{dup.toLocaleString()}</p>
        <p className="text-xs text-green-700">
          ventas nuevas · total en histórico: {step.total.toLocaleString()}
        </p>
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
            ventas en el archivo · {minDate} → {maxDate}
          </p>
          <p className="text-xs text-gray-400">
            Al agregar, las unidades ya cargadas (mismo código de barras) se ignoran — no hay doble
            conteo.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => handleUpload(rows, "agregar")}>Agregar al histórico</Button>
          <Button variant="outline" onClick={reset}>Cancelar</Button>
          <Button
            variant="ghost"
            className="text-red-600 hover:bg-red-50 hover:text-red-700 ml-auto"
            onClick={() => {
              if (confirm("Esto BORRA todo el histórico de ventas y lo reemplaza solo con este archivo. ¿Continuar?")) {
                handleUpload(rows, "reconstruir");
              }
            }}
          >
            Reconstruir (borrar todo)
          </Button>
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
            Se leen COD.BARRAS, COD.UNIV., FEC.VENDIDA y atributos (marca, categoría, precios,
            almacén). Solo se cargan filas con VEND=&apos;S&apos;. La carga es incremental.
          </p>
        </div>
      </div>
      <Button onClick={handleParse}>Leer archivo</Button>
    </div>
  );
}
