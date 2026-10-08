"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { avanzarTraslado, marcarAtendido } from "@/lib/actions/traslados";

export type TrasladoRow = {
  id: number; cod_barras: string; cod_universal: string; descripcion: string;
  origen: string; destino: string; tipo: string; estado: string;
  atendido: boolean; creado_at: string;
  partes: { lado: "izq" | "der"; origen: string; estado: "solicitado" | "enviado" | "recibido" }[];
};

export function TrasladosPanel({ rows, current, admin = false }: { rows: TrasladoRow[]; current?: string; admin?: boolean }) {
  const router = useRouter();
  const [credential, setCredential] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [router]);
  async function advance(id: number, lados: ("izq" | "der")[]) {
    setBusy(id); setMessage("");
    const result = await avanzarTraslado(id, lados, credential);
    setBusy(null); setMessage(result.msg);
    if (result.success) router.refresh();
  }
  async function attend(id: number, checked: boolean) {
    setBusy(id); setMessage("");
    const result = await marcarAtendido(id, checked);
    setBusy(null); setMessage(result.msg);
    if (result.success) router.refresh();
  }
  return <div className="space-y-4">
    {!admin && <label className="flex items-center gap-2 text-sm">Credencial de {current}<input type="password" value={credential} onChange={e => setCredential(e.target.value)} className="rounded border bg-background px-3 py-2" autoComplete="off" /></label>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted/50"><tr>
      <th className="p-2 text-left">Fecha</th><th className="p-2 text-left">Código</th><th className="p-2 text-left">Producto</th><th className="p-2 text-left">Ruta</th><th className="p-2 text-left">Estado</th><th className="p-2 text-left">Acción</th>
    </tr></thead><tbody>{rows.map(row => {
      const canSend = !admin && row.partes.filter((part) => part.estado === "solicitado" && part.origen === current);
      const canReceive = !admin && row.partes.filter((part) => part.estado === "enviado" && row.destino === current);
      const actionable = canSend && canSend.length ? canSend : canReceive && canReceive.length ? canReceive : [];
      const sending = !!(canSend && canSend.length);
      return <tr key={row.id} className="border-t align-top">
        <td className="p-2 whitespace-nowrap">{row.creado_at.slice(0, 16).replace("T", " ")}</td>
        <td className="p-2 font-mono"><Link className="underline" href={`${admin ? "/admin" : "/client"}/traslados/${row.id}`}>{row.cod_barras}</Link><br/><span className="text-muted-foreground">{row.cod_universal}</span></td>
        <td className="p-2">{row.descripcion}</td><td className="p-2">{row.partes.map((part) => <div key={part.lado} className="whitespace-nowrap">{part.lado.toUpperCase()}: {part.origen} → {row.destino} · {part.estado}</div>)}<span className="text-muted-foreground">{row.tipo}</span></td>
        <td className="p-2 capitalize">{row.estado}{row.atendido ? " · atendido" : ""}</td>
        <td className="p-2">{actionable.length ? <button disabled={busy !== null || !credential.trim()} onClick={() => advance(row.id, actionable.map((part) => part.lado))} className="rounded bg-primary px-2 py-1 text-primary-foreground disabled:opacity-50">{sending ? "Confirmar entrega" : "Recepcionar"} {actionable.length === 2 ? "ambos" : actionable[0].lado.toUpperCase()}</button> : admin && row.estado === "recibido" ? <label className="flex gap-2"><input type="checkbox" checked={row.atendido} disabled={busy !== null} onChange={e => attend(row.id, e.target.checked)} />Atendido</label> : "—"}</td>
      </tr>;
    })}</tbody></table>{!rows.length && <p className="p-5 text-sm text-muted-foreground">Sin movimientos.</p>}</div>
  </div>;
}
