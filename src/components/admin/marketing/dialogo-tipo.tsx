"use client";

// Formulario de un tipo de catálogo (nombre, descripción y los filtros que llena). Lo usan la pantalla Tipos (crear y
// editar) y el asistente («＋ Nuevo tipo» en el paso Filtros), para que sea el mismo en los dos lados.
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import type { EntradaTipo } from "@/lib/actions/marketing-tipos";
import type { TipoCatalogo } from "@/lib/marketing-catalogo";
import type { Opciones } from "./asistente-catalogo";

export type BorradorTipo = {
  nombre: string;
  descripcion: string;
  categorias: string[];
  grupos: string[];
  generos: string[];
  marcas: string[];
  tallas: string[];
  precioMin: string;
  precioMax: string;
};

export const BORRADOR_TIPO_VACIO: BorradorTipo = { nombre: "", descripcion: "", categorias: [], grupos: [], generos: [], marcas: [], tallas: [], precioMin: "", precioMax: "" };

export const borradorDeTipo = (t: TipoCatalogo): BorradorTipo => ({
  nombre: t.nombre,
  descripcion: t.descripcion,
  categorias: t.categorias,
  grupos: t.grupos,
  generos: t.generos,
  marcas: t.marcas,
  tallas: t.tallas,
  precioMin: t.precio_min == null ? "" : String(t.precio_min),
  precioMax: t.precio_max == null ? "" : String(t.precio_max),
});

const numero = (v: string) => {
  const n = v.trim() === "" ? null : Number(v);
  return n !== null && Number.isNaN(n) ? null : n;
};

/** Lo que reciben las acciones del servidor (crearTipo / actualizarTipo). */
export const aEntradaTipo = (b: BorradorTipo): EntradaTipo => ({
  nombre: b.nombre,
  descripcion: b.descripcion,
  categorias: b.categorias,
  grupos: b.grupos,
  generos: b.generos,
  marcas: b.marcas,
  tallas: b.tallas,
  precio_min: numero(b.precioMin),
  precio_max: numero(b.precioMax),
});

/** El tipo tal como quedó al guardarlo (con el id que le dio el servidor). */
export const tipoDesdeBorrador = (id: string, b: BorradorTipo): TipoCatalogo => ({
  id,
  nombre: b.nombre.trim().replace(/\s+/g, " "),
  descripcion: b.descripcion.trim(),
  base: false,
  activo: true,
  categorias: b.categorias,
  grupos: b.grupos,
  generos: b.generos,
  marcas: b.marcas,
  tallas: b.tallas,
  precio_min: numero(b.precioMin),
  precio_max: numero(b.precioMax),
});

function Chips({ valores, alQuitar }: { valores: string[]; alQuitar: (v: string) => void }) {
  if (valores.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {valores.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => alQuitar(v)}
          aria-label={`Quitar ${v}`}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs text-foreground transition-colors hover:bg-muted"
        >
          {v} <X className="h-3 w-3 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}

export function DialogoTipo({
  titulo,
  inicial,
  opciones,
  alGuardar,
  alCerrar,
}: {
  titulo: string;
  inicial: BorradorTipo;
  opciones: Opciones;
  /** Guarda el tipo; si sale bien el diálogo se cierra, si no muestra el mensaje. */
  alGuardar: (datos: BorradorTipo) => Promise<{ success: boolean; msg: string }>;
  alCerrar: () => void;
}) {
  const [d, setD] = useState<BorradorTipo>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cambiar = (parte: Partial<BorradorTipo>) => setD((s) => ({ ...s, ...parte }));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    const r = await alGuardar(d);
    setGuardando(false);
    if (!r.success) {
      setError(r.msg);
      return;
    }
    alCerrar();
  }

  return (
    <Dialog open onOpenChange={(o) => !guardando && !o && alCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={guardar} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>Estos son los filtros que se llenan al elegir el tipo en el asistente. Se pueden ajustar al crear cada catálogo.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="t-nombre">Nombre</Label>
              <Input id="t-nombre" value={d.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} maxLength={40} required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-desc">Descripción (opcional)</Label>
              <Input id="t-desc" value={d.descripcion} onChange={(e) => cambiar({ descripcion: e.target.value })} maxLength={120} />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <MultiSelectFilter label="Categoría" options={opciones.categorias} selected={d.categorias} onChange={(v) => cambiar({ categorias: v })} />
              <MultiSelectFilter label="Grupo" options={opciones.grupos} selected={d.grupos} onChange={(v) => cambiar({ grupos: v })} />
              <MultiSelectFilter label="Género" options={opciones.generos} selected={d.generos} onChange={(v) => cambiar({ generos: v })} />
              <MultiSelectFilter label="Marca" options={opciones.marcas} selected={d.marcas} onChange={(v) => cambiar({ marcas: v })} />
              <MultiSelectFilter label="Talla" options={opciones.tallas} selected={d.tallas} onChange={(v) => cambiar({ tallas: v })} />
            </div>
            <Chips valores={d.categorias.map((x) => `Categoría ${x}`)} alQuitar={(v) => cambiar({ categorias: d.categorias.filter((x) => `Categoría ${x}` !== v) })} />
            <Chips valores={d.grupos} alQuitar={(v) => cambiar({ grupos: d.grupos.filter((x) => x !== v) })} />
            <Chips valores={d.generos} alQuitar={(v) => cambiar({ generos: d.generos.filter((x) => x !== v) })} />
            <Chips valores={d.marcas} alQuitar={(v) => cambiar({ marcas: d.marcas.filter((x) => x !== v) })} />
            <Chips valores={d.tallas.map((x) => `Talla ${x}`)} alQuitar={(v) => cambiar({ tallas: d.tallas.filter((x) => `Talla ${x}` !== v) })} />
            <p className="text-xs text-muted-foreground">Necesita al menos una categoría, grupo, género o marca. Solo la talla o el precio traerían todo el ERP.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Precio lista (S/, opcional)</Label>
            <div className="flex items-center gap-2">
              <Input type="number" inputMode="decimal" min={0} value={d.precioMin} onChange={(e) => cambiar({ precioMin: e.target.value })} placeholder="Desde" className="w-32" aria-label="Precio desde" />
              <span className="text-sm text-muted-foreground">a</span>
              <Input type="number" inputMode="decimal" min={0} value={d.precioMax} onChange={(e) => cambiar({ precioMax: e.target.value })} placeholder="Hasta" className="w-32" aria-label="Precio hasta" />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={alCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando || d.nombre.trim().length < 2}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
