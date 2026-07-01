"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type ColDef } from "@/components/ui/data-table";
import { DiscountBadge } from "@/components/ui/discount-badge";
import { DestinoPicker, type Destino } from "@/components/admin/lote/destino-picker";
import { parseDescuentosMasivoFile } from "@/lib/masivo/parsers";
import {
  matchDescuentosMasivo,
  aplicarDescuentosMasivo,
  type DescuentoMasivoMatch,
} from "@/lib/actions/utils";

const MATCH_CHUNK = 1000;
const APPLY_CHUNK = 1000;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function rowKey(r: { cod_universal: string; genero: string }) {
  return `${r.cod_universal}|${r.genero}`;
}

type Step =
  | { id: "idle" }
  | { id: "matching" }
  | { id: "preview"; matches: DescuentoMasivoMatch[]; noEncontrados: string[]; invalidos: string[] }
  | { id: "applying" }
  | { id: "done"; msg: string }
  | { id: "error"; msg: string };

type Props = {
  borrador: { id: number; created_at: string } | null;
  publicado: { id: number; created_at: string; published_at: string } | null;
};

export function DescuentosMasivoForm({ borrador, publicado }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ id: "idle" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState<Destino>("borrador");

  async function handleLeer() {
    const file = fileRef.current?.files?.[0];
    if (!file) return alert("Selecciona el archivo (XLSX).");

    setStep({ id: "matching" });
    try {
      const rows = await parseDescuentosMasivoFile(file);
      if (rows.length === 0) throw new Error("No se encontraron filas con código y descuento válidos.");

      const chunks = chunkArray(rows, MATCH_CHUNK);
      const results = await Promise.all(chunks.map((c) => matchDescuentosMasivo(c)));
      const failed = results.find((r) => !r.success || !r.data);
      if (failed) throw new Error(failed.msg);

      const okResults = results.flatMap((r) => (r.data ? [r.data] : []));
      const matches = okResults.flatMap((d) => d.matches);
      const noEncontrados = okResults.flatMap((d) => d.noEncontrados);
      const invalidos = okResults.flatMap((d) => d.invalidos);

      setSelected(new Set(matches.map(rowKey)));
      setStep({ id: "preview", matches, noEncontrados, invalidos });
    } catch (e) {
      setStep({ id: "error", msg: String(e) });
    }
  }

  function toggleAll(matches: DescuentoMasivoMatch[]) {
    setSelected((prev) =>
      prev.size === matches.length ? new Set() : new Set(matches.map(rowKey))
    );
  }

  function toggleRow(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleAplicar(matches: DescuentoMasivoMatch[]) {
    const items = matches
      .filter((m) => selected.has(rowKey(m)))
      .map((m) => ({ cod_universal: m.cod_universal, genero: m.genero, descuento_nuevo: m.descuento_nuevo }));
    if (items.length === 0) return;

    setStep({ id: "applying" });
    try {
      const destinoArg = destino === "publicado" && publicado
        ? { tipo: "publicado" as const, loteId: publicado.id }
        : { tipo: "borrador" as const };

      const chunks = chunkArray(items, APPLY_CHUNK);
      let loteId = destinoArg.tipo === "publicado" ? destinoArg.loteId : undefined;
      let totalAplicadas = 0;
      for (const chunk of chunks) {
        const arg = loteId != null ? { tipo: "publicado" as const, loteId } : destinoArg;
        const result = await aplicarDescuentosMasivo(chunk, arg);
        if (!result.success) throw new Error(result.msg);
        loteId = result.data?.loteId;
        totalAplicadas += chunk.length;
      }

      setStep({ id: "done", msg: `${totalAplicadas} línea(s) aplicada(s) al lote #${loteId}.` });
      router.refresh();
    } catch (e) {
      setStep({ id: "error", msg: String(e) });
    }
  }

  function reset() {
    setStep({ id: "idle" });
    setSelected(new Set());
    setDestino("borrador");
    if (fileRef.current) fileRef.current.value = "";
  }

  const columns: ColDef<DescuentoMasivoMatch>[] = [
    {
      key: "check",
      header: "",
      width: 1,
      cell: (r) => (
        <Checkbox checked={selected.has(rowKey(r))} onCheckedChange={() => toggleRow(rowKey(r))} />
      ),
    },
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
      cell: (r) => <span className="text-sm">{r.genero}</span>,
    },
    {
      key: "marca",
      header: "Marca",
      sortable: true,
      width: 1,
      sortValue: (r) => r.marca ?? "",
      cell: (r) => <span className="text-sm">{r.marca ?? "—"}</span>,
    },
    {
      key: "modelo",
      header: "Modelo",
      sortable: true,
      width: 2,
      sortValue: (r) => r.modelo ?? "",
      cell: (r) => <span className="text-sm">{r.modelo ?? "—"}</span>,
    },
    {
      key: "descuento",
      header: "Descuento",
      align: "center",
      width: 2,
      cell: (r) => (
        <div className="flex items-center justify-center gap-1.5">
          <DiscountBadge value={r.descuento_actual} />
          <span className="text-[#bbb]">→</span>
          <DiscountBadge value={r.descuento_nuevo} />
        </div>
      ),
    },
  ];

  if (step.id === "done") {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 space-y-3">
        <p className="font-semibold text-green-800">Descuentos aplicados</p>
        <p className="text-sm text-green-700">{step.msg}</p>
        <Button variant="outline" size="sm" onClick={reset}>Nueva carga</Button>
      </div>
    );
  }

  if (step.id === "error") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 space-y-3">
        <p className="font-semibold text-red-800">Error</p>
        <p className="text-sm font-mono text-red-700">{step.msg}</p>
        <Button variant="outline" size="sm" onClick={reset}>Reintentar</Button>
      </div>
    );
  }

  if (step.id === "matching") {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border bg-white p-6 text-center text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Buscando productos...
      </div>
    );
  }

  if (step.id === "applying") {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border bg-white p-6 text-center text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Aplicando descuentos...
      </div>
    );
  }

  if (step.id === "preview") {
    const { matches, noEncontrados, invalidos } = step;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={() => toggleAll(matches)}>
              {selected.size === matches.length ? "Deseleccionar todo" : "Seleccionar todo"}
            </Button>
            <span className="text-sm text-[#41454d]">
              {selected.size} de {matches.length} seleccionado(s)
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#41454d]">Destino:</span>
            <DestinoPicker value={destino} onChange={setDestino} publicado={publicado} />
            <Button size="sm" onClick={() => handleAplicar(matches)} disabled={selected.size === 0}>
              Aplicar descuentos
            </Button>
          </div>
        </div>

        {(noEncontrados.length > 0 || invalidos.length > 0) && (
          <div className="space-y-1">
            {noEncontrados.length > 0 && (
              <p className="text-xs text-amber-700">
                {noEncontrados.length} código(s) no encontrados en productos: {noEncontrados.join(", ")}
              </p>
            )}
            {invalidos.length > 0 && (
              <p className="text-xs text-red-700">
                {invalidos.length} código(s) con descuento inválido (debe ser 0-100): {invalidos.join(", ")}
              </p>
            )}
          </div>
        )}

        <DataTable
          columns={columns}
          data={matches}
          keyFn={rowKey}
          defaultSort={{ key: "marca", dir: "asc" }}
          pageSize={50}
          emptyTitle="Sin coincidencias"
          emptyDesc="Ningún código del archivo coincide con un producto."
        />
      </div>
    );
  }

  // idle
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-6 space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Archivo de descuentos (XLSX)</label>
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
            Columnas requeridas: Código Universal, Descuento (0-100). Un código puede afectar más de un
            género si el producto existe en ambos.
          </p>
        </div>
        <p className="text-xs text-gray-400">
          {borrador
            ? `Hay un borrador #${borrador.id} en edición.`
            : "No hay borrador activo — se creará uno si eliges ese destino."}
          {publicado && ` Lote #${publicado.id} publicado, esperando confirmaciones.`}
        </p>
      </div>
      <Button onClick={handleLeer}>Leer archivo</Button>
    </div>
  );
}
