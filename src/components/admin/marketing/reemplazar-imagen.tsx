"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { estandarizarImagen, type ImagenEstandarizada } from "@/lib/estandarizar-imagen";
import { enviarImagen } from "@/lib/subir-imagen-cliente";
import { cn } from "@/lib/utils";

// Cuadrícula de ajedrez: deja ver que el PNG es realmente transparente.
export const AJEDREZ =
  "bg-[conic-gradient(#e5e7eb_25%,#fff_0_50%,#e5e7eb_0_75%,#fff_0)] bg-[length:16px_16px] dark:bg-[conic-gradient(#3f3f46_25%,#27272a_0_50%,#3f3f46_0_75%,#27272a_0)]";

type Props = {
  codigo: string;
  /** PNG original vigente, para mostrarlo como «Actual». */
  urlActual: string;
  /** Se llama tras reemplazar con éxito, con la versión nueva de la imagen. */
  onHecho: (version: number) => void;
  /** Vuelve a leer la página del servidor tras reemplazar (por defecto sí). */
  refrescar?: boolean;
};

export function ReemplazarImagen({ codigo, urlActual, onHecho, refrescar = true }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fase, setFase] = useState<"reposo" | "procesando" | "vista" | "subiendo">("reposo");
  const [nueva, setNueva] = useState<ImagenEstandarizada | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Libera la vista previa al descartar o desmontar.
  useEffect(() => () => { if (nueva) URL.revokeObjectURL(nueva.vistaPrevia); }, [nueva]);

  async function elegir(archivo: File) {
    setError(null);
    setFase("procesando");
    try {
      setNueva(await estandarizarImagen(archivo));
      setFase("vista");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo procesar la imagen");
      setFase("reposo");
    }
  }

  async function confirmar() {
    if (!nueva) return;
    setError(null);
    setFase("subiendo");
    const r = await enviarImagen(codigo, nueva.blob, "reemplazo");
    if (!r.ok) {
      setError(r.error);
      setFase("vista");
      return;
    }
    if (refrescar) router.refresh();
    onHecho(r.version);
  }

  function descartar() {
    setNueva(null);
    setError(null);
    setFase("reposo");
  }

  const enVista = fase === "vista" || fase === "subiendo";

  return (
    <div className="space-y-3">
      <div className={cn("grid gap-3", enVista ? "grid-cols-2" : "grid-cols-1")}>
        <figure className="space-y-1">
          <div className={cn("mx-auto aspect-square w-full rounded-lg", AJEDREZ, !enVista && "max-w-[70vh]")}>
            {/* Original completo: aquí se revisa la calidad del recorte. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urlActual} alt={`${codigo} actual`} className="h-full w-full object-contain" />
          </div>
          {enVista && <figcaption className="text-center text-xs text-muted-foreground">Actual</figcaption>}
        </figure>
        {enVista && nueva && (
          <figure className="space-y-1">
            <div className={cn("mx-auto aspect-square w-full rounded-lg", AJEDREZ)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={nueva.vistaPrevia} alt={`${codigo} nueva`} className="h-full w-full object-contain" />
            </div>
            <figcaption className="text-center text-xs text-muted-foreground">
              Nueva (recortada y centrada, {(nueva.blob.size / 1024).toFixed(0)} KB)
            </figcaption>
          </figure>
        )}
      </div>

      {nueva?.avisos.map((a) => (
        <p key={a} className="text-xs text-amber-600 dark:text-amber-400">{a}</p>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        {enVista ? (
          <>
            <Button variant="outline" onClick={descartar} disabled={fase === "subiendo"}>Cancelar</Button>
            <Button onClick={confirmar} disabled={fase === "subiendo"}>
              {fase === "subiendo" ? "Subiendo…" : "Confirmar reemplazo"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={fase === "procesando"}>
              {fase === "procesando" ? "Procesando…" : "Reemplazar imagen"}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) elegir(f);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
