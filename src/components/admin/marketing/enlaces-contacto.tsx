"use client";

// Datos de contacto que usan las zonas clicables de las portadas y cierres: se guardan UNA vez y cambiarlos aquí
// actualiza todas las páginas en la próxima publicación de cada catálogo.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guardarEnlaces } from "@/lib/actions/marketing-disenos";
import { enlaceDeContacto, type Enlaces } from "@/lib/marketing-catalogo";
import { cn } from "@/lib/utils";

const CAMPOS = [
  { clave: "whatsapp", nombre: "WhatsApp", ayuda: "Número, con o sin el 51", ejemplo: "981 320 417" },
  { clave: "instagram", nombre: "Instagram", ayuda: "Usuario o dirección", ejemplo: "@sportcenter.pe" },
  { clave: "tiktok", nombre: "TikTok", ayuda: "Usuario o dirección", ejemplo: "@sportcenter.pe" },
  { clave: "facebook", nombre: "Facebook", ayuda: "Nombre de la página o dirección", ejemplo: "sportcenter.pe" },
] as const;

export function EnlacesContacto({ inicial }: { inicial: Enlaces }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [valores, setValores] = useState(() => ({
    whatsapp: { valor: inicial.whatsapp?.valor ?? "", mensaje: inicial.whatsapp?.mensaje ?? "" },
    instagram: { valor: inicial.instagram?.valor ?? "", mensaje: "" },
    tiktok: { valor: inicial.tiktok?.valor ?? "", mensaje: "" },
    facebook: { valor: inicial.facebook?.valor ?? "", mensaje: "" },
  }));
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setMensaje(null);
    iniciar(async () => {
      const r = await guardarEnlaces(valores);
      setMensaje({ ok: r.success, texto: r.msg });
      if (r.success) router.refresh();
    });
  }

  return (
    <details className="mb-8 rounded-xl border border-border">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-foreground">
        Enlaces de contacto <span className="ml-1 text-xs font-normal text-muted-foreground">(a dónde llevan las zonas clicables)</span>
      </summary>
      <form onSubmit={guardar} className="space-y-4 border-t border-border p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {CAMPOS.map((c) => {
            const v = valores[c.clave];
            const destino = enlaceDeContacto(c.clave, v);
            return (
              <label key={c.clave} className="block space-y-1 text-xs font-medium text-foreground">
                {c.nombre} <span className="font-normal text-muted-foreground">· {c.ayuda}</span>
                <Input value={v.valor} onChange={(e) => setValores((x) => ({ ...x, [c.clave]: { ...x[c.clave], valor: e.target.value } }))} placeholder={c.ejemplo} maxLength={200} disabled={pendiente} />
                <span className={cn("block truncate text-[11px] font-normal", v.valor && !destino ? "text-destructive" : "text-muted-foreground")}>
                  {v.valor ? (destino ? `→ ${destino}` : "No es un dato válido") : "Sin configurar: las zonas de este tipo no llevarán enlace"}
                </span>
              </label>
            );
          })}
        </div>
        <label className="block max-w-xl space-y-1 text-xs font-medium text-foreground">
          Mensaje con el que se abre el chat de WhatsApp
          <Input value={valores.whatsapp.mensaje} onChange={(e) => setValores((x) => ({ ...x, whatsapp: { ...x.whatsapp, mensaje: e.target.value } }))} placeholder="Hola, quiero consultar por el catálogo" maxLength={200} disabled={pendiente} />
        </label>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pendiente}>
            {pendiente ? "Guardando…" : "Guardar enlaces"}
          </Button>
          {mensaje && <p className={cn("text-sm", mensaje.ok ? "text-green-600 dark:text-green-400" : "text-destructive")}>{mensaje.texto}</p>}
        </div>
      </form>
    </details>
  );
}
