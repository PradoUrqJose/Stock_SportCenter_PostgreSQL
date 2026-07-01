"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type ColDef } from "@/components/ui/data-table";
import { DiscountBadge } from "@/components/ui/discount-badge";
import { DestinoPicker, type Destino } from "@/components/admin/lote/destino-picker";
import { matchReposicion, aplicarReposicion, type ReposicionMatch } from "@/lib/actions/reposicion";

function rowKey(r: { cod_universal: string; genero: string }) {
  return `${r.cod_universal}|${r.genero}`;
}

function readAsText(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsText(file, "utf-8");
  });
}

type Step =
  | { id: "idle" }
  | { id: "matching" }
  | { id: "preview"; matches: ReposicionMatch[]; noEncontrados: string[] }
  | { id: "applying" }
  | { id: "done"; msg: string }
  | { id: "error"; msg: string };

type Props = {
  borrador: { id: number; created_at: string } | null;
  publicado: { id: number; created_at: string; published_at: string } | null;
};

export function ReposicionForm({ borrador, publicado }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ id: "idle" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState<Destino>("borrador");

  async function handleLeer() {
    const file = fileRef.current?.files?.[0];
    if (!file) return alert("Selecciona un archivo .txt");

    setStep({ id: "matching" });
    try {
      const text = await readAsText(file);
      const codigos = text
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);

      const result = await matchReposicion(codigos);
      if (!result.success || !result.data) {
        setStep({ id: "error", msg: result.msg });
        return;
      }
      setSelected(new Set(result.data.matches.map(rowKey)));
      setStep({ id: "preview", matches: result.data.matches, noEncontrados: result.data.noEncontrados });
    } catch (e) {
      setStep({ id: "error", msg: String(e) });
    }
  }

  function toggleAll(matches: ReposicionMatch[]) {
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

  async function handleAplicar(matches: ReposicionMatch[]) {
    const items = matches.filter((m) => selected.has(rowKey(m)));
    if (items.length === 0) return;

    setStep({ id: "applying" });
    const result = await aplicarReposicion(
      items.map((i) => ({ cod_universal: i.cod_universal, genero: i.genero })),
      destino === "publicado" && publicado
        ? { tipo: "publicado", loteId: publicado.id }
        : { tipo: "borrador" }
    );

    if (result.success) {
      setStep({ id: "done", msg: result.msg });
      router.refresh();
    } else {
      setStep({ id: "error", msg: result.msg });
    }
  }

  function reset() {
    setStep({ id: "idle" });
    setSelected(new Set());
    setDestino("borrador");
    if (fileRef.current) fileRef.current.value = "";
  }

  const columns: ColDef<ReposicionMatch>[] = [
    {
      key: "check",
      header: "",
      width: 1,
      cell: (r) => (
        <Checkbox
          checked={selected.has(rowKey(r))}
          onCheckedChange={() => toggleRow(rowKey(r))}
        />
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
      key: "categoria",
      header: "Categoría",
      sortable: true,
      width: 1,
      sortValue: (r) => r.categoria ?? "",
      cell: (r) => <span className="text-sm">{r.categoria ?? "—"}</span>,
    },
    {
      key: "color",
      header: "Color",
      sortable: true,
      width: 1,
      sortValue: (r) => r.color ?? "",
      cell: (r) => <span className="text-sm">{r.color ?? "—"}</span>,
    },
    {
      key: "descuento",
      header: "Descuento",
      align: "center",
      width: 2,
      cell: (r) => (
        <div className="flex items-center justify-center gap-1.5">
          <DiscountBadge value={r.descuento} />
          <span className="text-[#bbb]">→</span>
          <DiscountBadge value={0} />
        </div>
      ),
    },
  ];

  if (step.id === "done") {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 space-y-3">
        <p className="font-semibold text-green-800">Reposición aplicada</p>
        <p className="text-sm text-green-700">{step.msg}</p>
        <Button variant="outline" onClick={reset}>
          Nueva reposición
        </Button>
      </div>
    );
  }

  if (step.id === "error") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 space-y-3">
        <p className="font-semibold text-red-800">Error</p>
        <p className="text-sm font-mono text-red-700">{step.msg}</p>
        <Button variant="outline" onClick={reset}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (step.id === "matching") {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border bg-white p-6 text-center text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Buscando productos con descuento activo...
      </div>
    );
  }

  if (step.id === "applying") {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border bg-white p-6 text-center text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Aplicando reposición...
      </div>
    );
  }

  if (step.id === "preview") {
    const { matches, noEncontrados } = step;
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
            <span className="text-xs text-[#41454d]">Agregar a:</span>
            <DestinoPicker value={destino} onChange={setDestino} publicado={publicado} />
            <Button size="sm" onClick={() => handleAplicar(matches)} disabled={selected.size === 0}>
              Aplicar reposición
            </Button>
          </div>
        </div>

        {noEncontrados.length > 0 && (
          <p className="text-xs text-amber-700">
            {noEncontrados.length} código(s) no encontrados o sin descuento activo: {noEncontrados.join(", ")}
          </p>
        )}

        <DataTable
          columns={columns}
          data={matches}
          keyFn={rowKey}
          defaultSort={{ key: "marca", dir: "asc" }}
          pageSize={50}
          emptyTitle="Sin coincidencias"
          emptyDesc="Ningún código del archivo tiene descuento activo."
        />
      </div>
    );
  }

  // idle
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-6 space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Archivo de códigos (.txt)</label>
          <input
            ref={fileRef}
            type="file"
            accept=".txt"
            className="block w-full text-sm text-gray-600
              file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0
              file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700
              hover:file:bg-gray-200 cursor-pointer"
          />
          <p className="text-xs text-gray-400">Un código universal por línea.</p>
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
