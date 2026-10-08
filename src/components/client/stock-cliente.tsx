"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { enviarProducto, solicitarProducto } from "@/lib/actions/traslados";
import type { StockRow } from "@/app/client/stock/page";

export function StockCliente({ items, sites, current, warehouse, q }: {
  items: StockRow[]; sites: { nombre: string; tipo: string }[]; current: string; warehouse: boolean; q: string;
}) {
  const router = useRouter();
  const [credential, setCredential] = useState("");
  const [target, setTarget] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("q") ?? "").trim();
    setMessage("");
    router.push(`/client/stock?q=${encodeURIComponent(value)}`);
  }
  async function submit(item: StockRow, to?: string) {
    if (!credential.trim()) { setMessage("Ingresa tu credencial de sede."); return; }
    setBusy(true); setMessage("");
    const result = to ? await enviarProducto(item.cod_barras, to, credential) : await solicitarProducto(item.cod_barras, credential);
    setBusy(false); setMessage(result.msg);
    if (result.success) router.refresh();
  }
  return <div className="space-y-4">
    <form onSubmit={search} className="flex gap-2">
      <input name="q" defaultValue={q} autoFocus placeholder="Escanea código de barras o busca producto" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
      <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground">Buscar</button>
    </form>
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label>Credencial de {current}</label>
      <input type="password" value={credential} onChange={e => setCredential(e.target.value)} className="rounded-md border bg-background px-3 py-2" autoComplete="off" />
      <Link href="/client/traslados" className="underline">Ver solicitudes y envíos</Link>
    </div>
    {message && <p role="status" className="text-sm">{message}</p>}
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm"><thead className="bg-muted/50"><tr>
        <th className="p-2 text-left">Código</th><th className="p-2 text-left">Producto</th><th className="p-2 text-left">Talla</th><th className="p-2 text-left">Ubicación</th><th className="p-2 text-left">Acción</th>
      </tr></thead><tbody>{items.map(item => {
        const missing = [item.alm_izq, item.alm_der].filter((location) => location !== current);
        const owned = [item.alm_izq, item.alm_der].filter((location) => location === current).length;
        const to = target[item.cod_barras] ?? sites.find(s => s.nombre !== current && s.tipo === "tienda")?.nombre ?? "";
        return <tr key={item.cod_barras} className="border-t align-top">
          <td className="p-2 font-mono">{item.cod_barras}<br/><span className="text-muted-foreground">{item.cod_universal}</span></td>
          <td className="p-2">{item.marca} {item.modelo}</td><td className="p-2">{item.talla}</td>
          <td className="p-2"><span className="whitespace-nowrap">IZQ: {item.alm_izq}</span><br/><span className="whitespace-nowrap">DER: {item.alm_der}</span></td>
          <td className="p-2">{item.ocupado ? <span className="text-muted-foreground">Ocupado en ERP</span> : item.traslado_activo_id ? <Link href={`/client/traslados/${item.traslado_activo_id}`} className="underline">En trámite · ver avance</Link> : warehouse && owned ? <div className="flex flex-wrap gap-2">
            <select aria-label="Destino" value={to} onChange={e => setTarget({ ...target, [item.cod_barras]: e.target.value })} className="rounded border bg-background p-1">
              {sites.filter(s => s.nombre !== current && s.tipo === "tienda").map(s => <option key={s.nombre} value={s.nombre}>{s.nombre}</option>)}
            </select>
            <button disabled={busy || !to} onClick={() => submit(item, to)} className="rounded bg-primary px-2 py-1 text-primary-foreground disabled:opacity-50">Enviar {owned === 2 ? "par" : item.alm_izq === current ? "IZQ" : "DER"}</button>
          </div> : warehouse ? <span className="text-muted-foreground">Disponible para solicitud desde una tienda</span> : missing.length ? <button disabled={busy} onClick={() => submit(item)} className="rounded bg-primary px-2 py-1 text-primary-foreground disabled:opacity-50">Pedir {missing.length === 2 ? "par" : missing[0] === item.alm_izq ? "IZQ" : "DER"}</button> : <span className="text-muted-foreground">Par en tu sede</span>}</td>
        </tr>;
      })}</tbody></table>
      {!items.length && <p className="p-5 text-sm text-muted-foreground">Sin productos. Revisa el código o espera la carga de stock.</p>}
    </div>
  </div>;
}
