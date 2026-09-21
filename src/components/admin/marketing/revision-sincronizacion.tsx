"use client";

// Revisión de una sincronización con el ERP, ANTES de aplicarla: qué se actualiza, qué se agrega y —siempre, en grande—
// qué se quita por falta de stock. Nada cambia hasta pulsar «Aplicar»; las versiones ya publicadas nunca se tocan.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { aplicarSincronizacion } from "@/lib/actions/marketing-catalogos";
import { fechaStock, type InformeSincronizacion, type ProductoResumen } from "@/lib/marketing-sincronizar";
import { cn } from "@/lib/utils";

const n = (v: number) => v.toLocaleString("en-US");

function Dato({ etiqueta, valor, nota, alerta }: { etiqueta: string; valor: number; nota?: string; alerta?: boolean }) {
  return (
    <div className={cn("rounded-lg border px-4 py-3", alerta ? "border-amber-500/50 bg-amber-500/10" : "border-border bg-card")}>
      <p className={cn("text-xs", alerta ? "text-amber-800 dark:text-amber-300" : "text-muted-foreground")}>{etiqueta}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{n(valor)}</p>
      {nota && <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

function Lista({ titulo, productos, abierta, nota }: { titulo: string; productos: ProductoResumen[]; abierta?: boolean; nota?: string }) {
  if (productos.length === 0) return null;
  const tope = 300;
  return (
    <details open={abierta} className="rounded-lg border border-border">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">
        {titulo} ({n(productos.length)})
      </summary>
      {nota && <p className="px-4 pb-2 text-xs text-muted-foreground">{nota}</p>}
      <div className="max-h-80 overflow-y-auto border-t border-border">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-4 py-1.5 font-medium">Código</th>
              <th className="px-2 py-1.5 font-medium">Marca</th>
              <th className="px-2 py-1.5 font-medium">Modelo</th>
              <th className="px-2 py-1.5 font-medium">Género</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {productos.slice(0, tope).map((p) => (
              <tr key={`${p.cod}|${p.genero}`}>
                <td className="px-4 py-1.5 font-mono">{p.cod}</td>
                <td className="px-2 py-1.5">{p.marca}</td>
                <td className="px-2 py-1.5">{p.modelo}</td>
                <td className="px-2 py-1.5">{p.genero}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {productos.length > tope && <p className="px-4 py-2 text-xs text-muted-foreground">… y {n(productos.length - tope)} más.</p>}
      </div>
    </details>
  );
}

export function RevisionSincronizacion({
  generacionId,
  catalogoId,
  version,
  titulo,
  informe,
  filtrosTexto,
  filtrosCambiaron,
  volverA,
}: {
  generacionId: string;
  catalogoId: string;
  version: number | null;
  titulo: string;
  informe: InformeSincronizacion;
  filtrosTexto: string[];
  filtrosCambiaron: boolean;
  volverA: string;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const q = informe.quitados.length;
  const nuevos = informe.nuevos.length;
  const hayCambios = q > 0 || nuevos > 0 || informe.actualizados > 0 || informe.reactivados.length > 0;
  // Quitar una parte grande del catálogo casi siempre es un error de filtros o un ERP que respondió mal.
  const muchos = q > 0 && q >= Math.max(20, informe.antes * 0.3);
  const destino = version === null ? "el borrador" : `el borrador de la v${version}`;

  function aplicar() {
    setError(null);
    iniciar(async () => {
      const r = await aplicarSincronizacion(generacionId);
      if (r.success && r.data) router.push(`/admin/marketing/catalogos/${catalogoId}/editar${r.data.version === null ? "" : `?version=${r.data.version}`}`);
      else setError(r.msg);
    });
  }

  return (
    <div className="max-w-4xl space-y-6">
      <p className="text-sm text-muted-foreground">
        «{titulo}»{version === null ? "" : ` · versión ${version}`} · ERP consultado el {fechaStock(informe.al)}
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Dato etiqueta="Con tallas o precio nuevos" valor={informe.actualizados} nota={`${n(informe.cambiosTallas)} de tallas · ${n(informe.cambiosPrecio)} de precio`} />
        <Dato etiqueta="Productos nuevos" valor={nuevos} nota="Entran en su lugar dentro de su marca" />
        <Dato etiqueta="Se quitan por falta de stock" valor={q} nota="Quedan en «Quitadas», se pueden restaurar" alerta={q > 0} />
        <Dato etiqueta="Sin cambios" valor={informe.sinCambios} />
      </div>

      {q > 0 && (
        <div
          className={cn(
            "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
            muchos ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-300"
          )}
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <strong>Se quitarán {n(q)} producto{q === 1 ? "" : "s"}</strong> porque ya no tienen stock o ya no cumplen los filtros. Sus páginas no se borran: quedan en «Quitadas» en el editor
            y las puedes restaurar.
            {muchos && " Es una parte grande del catálogo: revisa que los filtros sean los correctos antes de aplicar."}
          </p>
        </div>
      )}

      <Lista titulo="Productos que se quitan" productos={informe.quitados} abierta nota="Sin stock en el ERP o fuera de los filtros de esta sincronización." />
      <Lista titulo="Productos nuevos" productos={informe.nuevos} />
      <Lista titulo="Vuelven porque otra vez tienen stock" productos={informe.reactivados} abierta />

      {(Object.keys(informe.sinPlantilla).length > 0 || informe.sinImagen.length > 0) && (
        <div className="space-y-1 rounded-lg border border-border px-4 py-3 text-xs text-muted-foreground">
          {Object.keys(informe.sinPlantilla).length > 0 && (
            <p>
              No entran por no tener plantilla de su marca:{" "}
              {Object.entries(informe.sinPlantilla)
                .map(([m, c]) => `${m} (${c})`)
                .join(", ")}
              .
            </p>
          )}
          {informe.sinImagen.length > 0 && <p>Con la imagen por agregar (sus páginas salen vacías hasta que la subas en el editor): {informe.sinImagen.slice(0, 40).join(", ")}{informe.sinImagen.length > 40 ? ` … y ${informe.sinImagen.length - 40} más` : ""}.</p>}
        </div>
      )}

      <div className="rounded-lg border border-border px-4 py-3 text-xs text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">Filtros usados{filtrosCambiaron ? " (distintos a los del catálogo: pasarán a ser los del catálogo)" : ""}</p>
        <p>{filtrosTexto.join(" · ")}</p>
      </div>

      <div className="space-y-3 border-t border-border pt-5">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={aplicar} disabled={pendiente}>
            <Check data-icon="inline-start" /> {pendiente ? "Aplicando…" : hayCambios ? `Aplicar a ${destino}` : "Marcar el stock como al día"}
          </Button>
          <Link href={volverA} className={cn(buttonVariants({ variant: "outline" }))}>
            Cancelar
          </Link>
        </div>
        <p className="max-w-2xl text-xs text-muted-foreground">
          Se aplica a {destino}, no a lo que ven los clientes. Cuando publiques como versión nueva, el enlace pasará a mostrar el stock actualizado; las versiones anteriores se conservan tal como se publicaron.
        </p>
      </div>
    </div>
  );
}
