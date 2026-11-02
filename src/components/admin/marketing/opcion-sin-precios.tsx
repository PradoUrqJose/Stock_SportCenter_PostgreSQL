"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MARCA_GENERICA, plantillaGeneral } from "@/lib/marketing-catalogo";
import type { DatosCatalogo, Recursos } from "./asistente-catalogo";
import { SubirDisenoAqui } from "./subir-diseno-aqui";

export function OpcionSinPrecios({ recursos, datos, cambiar, disabled = false }: {
  recursos: Recursos;
  datos: DatosCatalogo;
  cambiar: (parte: Partial<DatosCatalogo>) => void;
  disabled?: boolean;
}) {
  const [subir, setSubir] = useState(false);
  const disponibles = recursos.plantillas.filter((p) => p.activa && p.marca === MARCA_GENERICA);
  const general = plantillaGeneral(recursos.plantillas, datos.plantillaGeneral);
  return (
    <div className="mb-6 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Precios del catálogo</p>
          <p className="text-xs text-muted-foreground">Sin precios usa una plantilla GENERAL para todas las marcas.</p>
        </div>
        <div className="inline-flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Mostrar precios">
          {[false, true].map((sinPrecios) => (
            <Button key={String(sinPrecios)} type="button" size="sm" variant={datos.sinPrecios === sinPrecios ? "default" : "ghost"}
              aria-pressed={datos.sinPrecios === sinPrecios} disabled={disabled}
              onClick={() => cambiar({ sinPrecios, ...(sinPrecios && general ? { plantillaGeneral: general.id } : {}) })}>
              {sinPrecios ? "Sin precios" : "Con precios"}
            </Button>
          ))}
        </div>
      </div>
      {datos.sinPrecios && (
        <div className="mt-4 space-y-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-48 flex-1 space-y-1 text-sm">
              <span>Plantilla GENERAL</span>
              <select value={general?.id ?? ""} disabled={disabled} onChange={(e) => cambiar({ plantillaGeneral: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                {!general && <option value="">{disponibles.length ? "Elige una plantilla" : "Todavía no hay una general activa"}</option>}
                {disponibles.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.predeterminada ? " · Predeterminada" : ""}</option>)}
              </select>
            </label>
            <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setSubir(true)}>
              <Upload /> Subir general
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Elige un fondo sin precios impresos. El código y las tallas se conservan.</p>
          {!general && <p role="status" className="text-xs text-amber-700 dark:text-amber-400">Elige o sube una plantilla GENERAL antes de continuar.</p>}
        </div>
      )}
      {subir && <SubirDisenoAqui destino={{ clase: "plantilla", marca: MARCA_GENERICA }}
        existentes={recursos.plantillas.filter((p) => p.marca === MARCA_GENERICA).map((p) => p.nombre)} tipo={null}
        alSubir={({ id }) => cambiar({ sinPrecios: true, plantillaGeneral: id })} alCerrar={() => setSubir(false)} />}
    </div>
  );
}
