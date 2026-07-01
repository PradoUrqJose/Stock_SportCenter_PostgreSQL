"use client";

import { useState, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  parseStockFile,
  parseImagesFile,
  parseDiscountFiles,
  buildData,
} from "@/lib/upload/parsers";
import {
  initUpload,
  uploadProductosBatch,
  uploadVariantesBatch,
  uploadImagenesBatch,
  finalizeUpload,
} from "@/lib/actions/upload";
import type { BuildResult } from "@/lib/upload/types";

const BATCH_SIZE = 500;
const CONCURRENCY = 3;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

type Step =
  | { id: "idle" }
  | { id: "parsing" }
  | { id: "preview"; result: BuildResult }
  | { id: "uploading"; label: string; current: number; total: number }
  | { id: "done"; productos: number; variantes: number; imagenes: number }
  | { id: "error"; msg: string };

export function UploadForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [step, setStep] = useState<Step>({ id: "idle" });

  const stockRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef<HTMLInputElement>(null);
  const discountsRef = useRef<HTMLInputElement>(null);

  async function handleParse() {
    const stockFile = stockRef.current?.files?.[0];
    const imagesFile = imagesRef.current?.files?.[0];
    const discountFiles = Array.from(discountsRef.current?.files ?? []);

    if (!stockFile) return alert("Selecciona el archivo de stock (XLSX).");

    setStep({ id: "parsing" });
    try {
      const rawRows = await parseStockFile(stockFile);
      const imageMap = imagesFile ? await parseImagesFile(imagesFile) : new Map<string, string>();
      const discountMap =
        discountFiles.length > 0
          ? await parseDiscountFiles(discountFiles)
          : new Map<string, number>();

      const result = buildData(rawRows, imageMap, discountMap);
      setStep({ id: "preview", result });
    } catch (e) {
      setStep({ id: "error", msg: String(e) });
    }
  }

  async function handleUpload(result: BuildResult) {
    const { productos, variantes, imagenes } = result;

    try {
      // 1. Clear mirror
      setStep({ id: "uploading", label: "Limpiando espejo...", current: 0, total: 0 });
      const init = await initUpload();
      if (!init.success) throw new Error(init.msg);

      // 2. Upload productos
      const prodBatches = chunkArray(productos, BATCH_SIZE);
      let done = 0;
      for (let i = 0; i < prodBatches.length; i += CONCURRENCY) {
        const group = prodBatches.slice(i, i + CONCURRENCY);
        const results = await Promise.all(group.map((b) => uploadProductosBatch(b)));
        const failed = results.find((r) => !r.success);
        if (failed) throw new Error(failed.msg);
        done = Math.min(i + CONCURRENCY, prodBatches.length);
        setStep({ id: "uploading", label: "Subiendo productos", current: done, total: prodBatches.length });
      }

      // 3. Upload variantes
      const varBatches = chunkArray(variantes, BATCH_SIZE);
      done = 0;
      for (let i = 0; i < varBatches.length; i += CONCURRENCY) {
        const group = varBatches.slice(i, i + CONCURRENCY);
        const results = await Promise.all(group.map((b) => uploadVariantesBatch(b)));
        const failed = results.find((r) => !r.success);
        if (failed) throw new Error(failed.msg);
        done = Math.min(i + CONCURRENCY, varBatches.length);
        setStep({ id: "uploading", label: "Subiendo variantes", current: done, total: varBatches.length });
      }

      // 4. Upload imagenes
      if (imagenes.length > 0) {
        const imgBatches = chunkArray(imagenes, BATCH_SIZE);
        done = 0;
        for (let i = 0; i < imgBatches.length; i += CONCURRENCY) {
          const group = imgBatches.slice(i, i + CONCURRENCY);
          const results = await Promise.all(group.map((b) => uploadImagenesBatch(b)));
          const failed = results.find((r) => !r.success);
          if (failed) throw new Error(failed.msg);
          done = Math.min(i + CONCURRENCY, imgBatches.length);
          setStep({ id: "uploading", label: "Subiendo imágenes", current: done, total: imgBatches.length });
        }
      }

      // 5. Finalize
      setStep({ id: "uploading", label: "Finalizando...", current: 0, total: 0 });
      const fin = await finalizeUpload(productos.length + variantes.length);
      if (!fin.success) throw new Error(fin.msg);

      setStep({ id: "done", productos: productos.length, variantes: variantes.length, imagenes: imagenes.length });
      onSuccess?.();
    } catch (e) {
      setStep({ id: "error", msg: String(e) });
    }
  }

  function reset() {
    setStep({ id: "idle" });
    if (stockRef.current) stockRef.current.value = "";
    if (imagesRef.current) imagesRef.current.value = "";
    if (discountsRef.current) discountsRef.current.value = "";
  }

  // --- render ---

  if (step.id === "done") {
    return (
      <div className="rounded-xl border border-green-200 dark:border-green-500/25 bg-green-50 dark:bg-green-500/10 p-6 space-y-4">
        <p className="font-semibold text-green-800 dark:text-green-300 text-lg">Upload completado</p>
        <div className="grid grid-cols-3 gap-4 text-center">
          <Stat label="Productos" value={step.productos} />
          <Stat label="Variantes" value={step.variantes} />
          <Stat label="Imágenes" value={step.imagenes} />
        </div>
        <Button variant="outline" onClick={reset} className="mt-2">
          Nueva carga
        </Button>
      </div>
    );
  }

  if (step.id === "error") {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10 p-6 space-y-3">
        <p className="font-semibold text-red-800 dark:text-red-300">Error durante el upload</p>
        <p className="text-sm text-red-700 dark:text-red-300 font-mono">{step.msg}</p>
        <Button variant="outline" onClick={reset}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (step.id === "parsing") {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border bg-card p-6 text-center text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Leyendo archivos...
      </div>
    );
  }

  if (step.id === "uploading") {
    const pct =
      step.total > 0 ? Math.round((step.current / step.total) * 100) : null;
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
          <p className="text-xs text-gray-400 text-right">
            {step.current} / {step.total} lotes
          </p>
        )}
      </div>
    );
  }

  if (step.id === "preview") {
    const { result } = step;
    return (
      <div className="space-y-6">
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <p className="font-medium text-gray-800">Archivos leídos correctamente</p>
          <div className="grid grid-cols-3 gap-4 text-center">
            <Stat label="Productos" value={result.productos.length} />
            <Stat label="Variantes" value={result.variantes.length} />
            <Stat label="Imágenes" value={result.imagenes.length} />
          </div>
          <p className="text-xs text-gray-400">
            El espejo se vaciará y se repoblará con estos datos. Los lotes y confirmaciones
            no se tocan.
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => handleUpload(result)}>Iniciar upload</Button>
          <Button variant="outline" onClick={reset}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  // idle
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6 space-y-5">
        <FileField
          label="Stock (XLSX)"
          accept=".xlsx,.xls"
          inputRef={stockRef}
          required
        />
        <FileField
          label="Imágenes (HTML)"
          accept=".html,.htm"
          inputRef={imagesRef}
        />
        <FileField
          label="Descuentos (HTML, múltiples)"
          accept=".html,.htm"
          inputRef={discountsRef}
          multiple
          hint="El % de descuento se lee del nombre del archivo (ej: 10.html = 10%)"
        />
      </div>
      <Button onClick={handleParse}>Leer archivos</Button>
    </div>
  );
}

// --- sub-components ---

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-card border p-3">
      <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function FileField({
  label,
  accept,
  inputRef,
  multiple,
  required,
  hint,
}: {
  label: string;
  accept: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  multiple?: boolean;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="block w-full text-sm text-gray-600
          file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0
          file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700
          hover:file:bg-gray-200 cursor-pointer"
      />
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}
