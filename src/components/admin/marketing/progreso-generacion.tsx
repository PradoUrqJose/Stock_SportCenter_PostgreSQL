"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { estadoGeneracion, type EstadoGeneracion } from "@/lib/actions/marketing-catalogos";
import { cn } from "@/lib/utils";

const ETAPAS: { id: EstadoGeneracion["etapa"]; texto: string; nota: string }[] = [
  { id: "erp", texto: "Consultando el ERP", nota: "Es lo que más tarda: hasta 40 s con catálogos grandes" },
  { id: "armando", texto: "Armando las páginas", nota: "Una por producto y género, ordenadas por marca" },
  { id: "guardando", texto: "Guardando el catálogo", nota: "" },
];

const ETAPAS_SINCRONIZAR: typeof ETAPAS = [
  { id: "erp", texto: "Consultando el ERP", nota: "Es lo que más tarda: hasta 40 s con catálogos grandes" },
  { id: "armando", texto: "Armando los datos frescos", nota: "Tallas y precios de hoy" },
  { id: "guardando", texto: "Comparando con tu catálogo", nota: "" },
];

const reloj = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Sigue una generación en segundo plano y, al terminar, abre el catálogo en el editor. */
export function ProgresoGeneracion({ id, titulo }: { id: string; titulo: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoGeneracion | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    let temporizador: ReturnType<typeof setTimeout> | undefined;

    async function consultar() {
      const r = await estadoGeneracion(id);
      if (!vivo) return;
      if (!r.success || !r.data) {
        setFallo(r.msg);
        return;
      }
      setEstado(r.data);
      if (r.data.estado === "en_curso") temporizador = setTimeout(consultar, 1500);
      else if (r.data.estado === "listo" && r.data.catalogoId) {
        // Una sincronización termina en su pantalla de revisión (nada se cambia hasta aplicarla); una generación, en el editor.
        temporizador = setTimeout(() => (r.data!.modo === "sincronizar" ? router.refresh() : router.push(`/admin/marketing/catalogos/${r.data!.catalogoId}/editar`)), 900);
      }
    }
    void consultar();
    return () => {
      vivo = false;
      clearTimeout(temporizador);
    };
  }, [id, router]);

  const etapas = estado?.modo === "sincronizar" ? ETAPAS_SINCRONIZAR : ETAPAS;
  const actual = estado ? etapas.findIndex((e) => e.id === estado.etapa) : 0;
  const terminado = estado?.estado === "listo";
  const conError = estado?.estado === "error";

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <p className="text-sm font-medium text-foreground">{titulo}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {estado ? `Tiempo: ${reloj(estado.segundos)}` : "Consultando el avance…"}
          {" · "}{estado?.modo === "sincronizar" ? "Si sales de esta pantalla la consulta sigue, pero tendrás que volver a abrir la sincronización para revisarla." : "Puedes salir de esta pantalla: la generación sigue y queda en el historial de Catálogos."}
        </p>
      </div>

      {fallo && <p className="text-sm text-destructive">{fallo}</p>}

      <ol className="space-y-3">
        {etapas.map((e, i) => {
          const hecha = terminado || i < actual;
          const enCurso = !terminado && !conError && i === actual;
          const fallida = conError && i === actual;
          return (
            <li key={e.id} className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                  hecha && "border-green-600 bg-green-600 text-white",
                  enCurso && "border-foreground text-foreground",
                  fallida && "border-destructive text-destructive",
                  !hecha && !enCurso && !fallida && "border-border text-muted-foreground"
                )}
              >
                {hecha ? <Check className="h-3 w-3" /> : enCurso ? <Loader2 className="h-3 w-3 animate-spin" /> : fallida ? <AlertTriangle className="h-3 w-3" /> : null}
              </span>
              <div>
                <p className={cn("text-sm", enCurso || hecha ? "text-foreground" : "text-muted-foreground")}>{e.texto}</p>
                {enCurso && e.nota && <p className="text-xs text-muted-foreground">{e.nota}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      {terminado && (
        <p className="text-sm text-green-600 dark:text-green-400">
          {estado?.mensaje}. {estado?.modo === "sincronizar" ? "Preparando la revisión…" : "Abriendo el editor…"}
        </p>
      )}
      {conError && (
        <div className="space-y-3">
          <p className="text-sm text-destructive">{estado?.mensaje}</p>
          <Link href={estado?.modo === "sincronizar" && estado.catalogoId ? `/admin/marketing/catalogos/${estado.catalogoId}/sincronizar${estado.baseVersion === null ? "" : `?version=${estado.baseVersion}`}` : "/admin/marketing/catalogos/nuevo"} className={cn(buttonVariants({ variant: "outline" }))}>
            Volver a intentar
          </Link>
        </div>
      )}
    </div>
  );
}
