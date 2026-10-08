"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TrasladosUpload() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      const form = new FormData(e.currentTarget);
      const response = await fetch("/api/inventario/cargar", { method: "POST", body: form });
      const result = await response.json();
      setMessage(result.msg ?? "Error de carga");
      if (response.ok) router.refresh();
    } catch { setMessage("No se pudo cargar el archivo"); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-2 rounded-lg border p-4">
    <h2 className="font-medium">Actualizar stock completo</h2>
    <p className="text-sm text-muted-foreground">Excel “Mi Mercadería - Todos los almacenes - No Vendidos”. La carga reemplaza el stock solo cuando termina y conserva el historial de traslados.</p>
    <div className="flex flex-wrap gap-2"><input name="archivo" type="file" accept=".xlsx" required className="text-sm" /><button disabled={busy} className="rounded bg-primary px-3 py-1 text-primary-foreground disabled:opacity-50">{busy ? "Cargando…" : "Cargar Excel"}</button></div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirmar_reduccion" value="si" />Confirmo si este archivo tiene más de 20% menos códigos que la carga anterior</label>
    {message && <p role="status" className="text-sm">{message}</p>}
  </form>;
}
