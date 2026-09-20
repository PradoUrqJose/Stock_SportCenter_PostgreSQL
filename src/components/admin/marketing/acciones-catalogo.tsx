"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { publicarCatalogo } from "@/lib/actions/marketing-catalogos";
import { cn } from "@/lib/utils";

export function PublicarCatalogo({ id, version }: { id: string; version: number | null }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  function publicar() {
    setMensaje(null);
    iniciar(async () => {
      const r = await publicarCatalogo(id);
      setMensaje({ ok: r.success, texto: r.msg });
      // Tras publicar se abre el editor a pantalla completa con la versión nueva y el enlace para los clientes.
      if (r.success && r.data) router.push(`/admin/marketing/catalogos/${id}/editar?version=${r.data.version}&publicado=${r.data.version}`);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={publicar} disabled={pendiente}>
        {pendiente ? "Publicando…" : version ? "Publicar nueva versión" : "Publicar"}
      </Button>
      {mensaje && (
        <p className={cn("text-sm", mensaje.ok ? "text-green-600 dark:text-green-400" : "text-destructive")}>{mensaje.texto}</p>
      )}
    </div>
  );
}

export function EnlaceCatalogo({ etiqueta, url }: { etiqueta: string; url: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Sin permiso del portapapeles: el enlace sigue visible para copiarlo a mano.
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs">{url}</code>
        <Button type="button" variant="outline" size="icon" onClick={copiar} aria-label="Copiar enlace">
          {copiado ? <Check /> : <Copy />}
        </Button>
        <a href={url} target="_blank" rel="noreferrer" aria-label="Abrir enlace" className={cn(buttonVariants({ variant: "outline", size: "icon" }))}>
          <ExternalLink />
        </a>
      </div>
    </div>
  );
}
