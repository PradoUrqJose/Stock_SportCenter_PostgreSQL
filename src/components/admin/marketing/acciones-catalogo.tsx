"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { eliminarCatalogo, publicarCatalogo } from "@/lib/actions/marketing-catalogos";
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

/**
 * Borra un catálogo entero (sus versiones incluidas). Lo pide Marketing para limpiar los de prueba: es irreversible
 * y, si estaba publicado, el enlace de los clientes deja de funcionar al instante.
 * `compacto` = solo el ícono, para las filas de la lista; si no, el botón lleva su texto (detalle del catálogo).
 */
export function EliminarCatalogo({
  id,
  titulo,
  slug,
  publicado,
  compacto = false,
  trasBorrar = "refrescar",
}: {
  id: string;
  titulo: string;
  slug: string;
  /** Versión vigente publicada; null = nunca se publicó (solo hay un borrador). */
  publicado: number | null;
  compacto?: boolean;
  /**
   * Qué hacer al borrar con éxito. "refrescar" (una fila de la lista: la fila desaparece sola) o "lista" (se está
   * viendo el propio catálogo que se borró: vuelve a la lista, porque refrescar esta página daría un 404).
   */
  trasBorrar?: "refrescar" | "lista";
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={compacto ? "icon-sm" : "sm"}
        aria-label={`Borrar ${titulo}`}
        title="Borrar catálogo"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={(e) => {
          // Cuando el botón vive dentro de la fila enlazada de la lista, que no navegue a abrir el catálogo.
          e.preventDefault();
          e.stopPropagation();
          setAbierto(true);
        }}
      >
        <Trash2 data-icon={compacto ? undefined : "inline-start"} />
        {!compacto && "Borrar"}
      </Button>
      <ConfirmDialog
        open={abierto}
        onOpenChange={setAbierto}
        title={`Borrar «${titulo}»`}
        description={
          publicado
            ? `Se borra junto con todas sus versiones publicadas (vigente: v${publicado}). El enlace de los clientes (/${slug}) dejará de funcionar al instante. No se puede deshacer.`
            : "Es solo un borrador (nunca se publicó); se borra junto con su historial de generación. No se puede deshacer."
        }
        confirmLabel="Borrar catálogo"
        variant="destructive"
        onConfirm={() => eliminarCatalogo(id)}
        onSuccess={() => (trasBorrar === "lista" ? router.push("/admin/marketing/catalogos") : router.refresh())}
      />
    </>
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
