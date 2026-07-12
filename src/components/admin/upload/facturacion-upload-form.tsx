"use client";

import { useState, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { parseFacturacionFile } from "@/lib/upload/parsers";
import { uploadFacturacionBatch, finalizeFacturacionUpload } from "@/lib/actions/upload";
import type { FacturacionInsert } from "@/lib/upload/types";

const BATCH_SIZE = 500;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type Step =
  | { id: "idle" }
  | { id: "parsing" }
  | { id: "preview"; rows: FacturacionInsert[] }
  | { id: "uploading"; label: string; current: number; total: number }
  | { id: "done"; insertadas: number; total: number }
  | { id: "error"; msg: string };

export function FacturacionUploadForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [step, setStep] = useState<Step>({ id: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleParse() {
    const file = fileRef.current?.files?.[0];
    if (!file) return alert("Selecciona el archivo de facturación (XLSX).");
    setStep({ id: "parsing" });
    try {
      const rows = await parseFacturacionFile(file);
      if (rows.length === 0) throw new Error("No se encontraron filas válidas (con SER-NUM y FECHA).");
      setStep({ id: "preview", rows });
    } catch (e) {
      setStep({ id: "error", msg: String(e) });
    }
  }

  async function handleUpload(rows: FacturacionInsert[]) {
    try {
      const batches = chunkArray(rows, BATCH_SIZE);
      let insertadas = 0;
      for (let i = 0; i < batches.length; i++) {
        const res = await uploadFacturacionBatch(batches[i]);
        if (!res.success) throw new Error(res.msg);
        insertadas += res.data?.insertadas ?? 0;
        setStep({ id: "uploading", label: "Subiendo facturación", current: i + 1, total: batches.length });
      }

      setStep({ id: "uploading", label: "Finalizando...", current: 0, total: 0 });
      const fin = await finalizeFacturacionUpload(rows.length);
      if (!fin.success) throw new Error(fin.msg);

      setStep({ id: "done", insertadas, total: fin.data?.total ?? 0 });
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
      <div className="rounded-xl border border-green-200 dark:border-green-500/25 bg-green-50 dark:bg-green-500/10 p-6 space-y-4">
        <p className="font-semibold text-green-800 dark:text-green-300">Facturación agregada</p>
        <p className="text-2xl font-bold text-green-900 dark:text-green-200">{step.insertadas.toLocaleString()}</p>
        <p className="text-xs text-green-700 dark:text-green-300">
          facturas nuevas · total en histórico: {step.total.toLocaleString()}
        </p>
        <Button variant="outline" size="sm" onClick={reset}>Nueva carga</Button>
      </div>
    );
  }

  if (step.id === "error") {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10 p-6 space-y-3">
        <p className="font-semibold text-red-800 dark:text-red-300">Error durante el import</p>
        <p className="text-sm text-red-700 dark:text-red-300 font-mono">{step.msg}</p>
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
    const pct = step.total > 0 ? Math.round((step.current / step.total) * 100) : null;
    return (
      <div className="rounded-xl border bg-card p-6 space-y-4">
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
    const minDate = rows.reduce((a, r) => r.fecha < a ? r.fecha : a, rows[0]?.fecha ?? "");
    const maxDate = rows.reduce((a, r) => r.fecha > a ? r.fecha : a, rows[0]?.fecha ?? "");
    return (
      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-6 space-y-3">
          <p className="font-medium text-gray-800">Archivo leído correctamente</p>
          <p className="text-2xl font-bold text-gray-900">{rows.length.toLocaleString()}</p>
          <p className="text-xs text-gray-500">
            facturas en el archivo · {minDate} → {maxDate}
          </p>
          <p className="text-xs text-gray-400">
            Los documentos ya cargados (mismo N° de documento) se ignoran — no hay doble conteo.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => handleUpload(rows)}>Agregar al histórico</Button>
          <Button variant="outline" onClick={reset}>Cancelar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-gray-700">
            Reporte de facturación (XLSX) <span className="text-red-500">*</span>
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
            Acepta tanto el formato histórico (N°, MAYORISTA, MINORISTA, COMPROBANTE, FECHA, TOTAL,
            SER-NUM) como el del reporte actual. La carga es incremental.
          </p>
        </div>
      </div>
      <Button onClick={handleParse}>Leer archivo</Button>
    </div>
  );
}
