"use client";

// «Guardar como tipo»: convierte los filtros que se armaron a mano en un tipo de catálogo nuevo, que queda junto a los
// de fábrica (con su portada asociada y sus páginas automáticas). No cambia ningún catálogo ya generado.
import { useState, useTransition } from "react";
import { BookmarkPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { crearTipo } from "@/lib/actions/marketing-tipos";
import type { TipoCatalogo } from "@/lib/marketing-catalogo";

export type FiltrosParaTipo = {
  categorias: string[];
  grupos: string[];
  generos: string[];
  marcas: string[];
  tallas: string[];
  precioMin: string;
  precioMax: string;
};

const numero = (v: string) => {
  const n = v.trim() === "" ? null : Number(v);
  return n !== null && Number.isNaN(n) ? null : n;
};

export function GuardarComoTipo({
  filtros,
  nombreSugerido,
  alGuardar,
}: {
  filtros: FiltrosParaTipo;
  nombreSugerido: string;
  /** El tipo ya creado, para que el asistente lo agregue a la lista y lo deje elegido. */
  alGuardar: (tipo: TipoCatalogo) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function abrir() {
    setNombre(nombreSugerido);
    setDescripcion("");
    setError(null);
    setAbierto(true);
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const precio_min = numero(filtros.precioMin);
    const precio_max = numero(filtros.precioMax);
    iniciar(async () => {
      const r = await crearTipo({
        nombre,
        descripcion,
        categorias: filtros.categorias,
        grupos: filtros.grupos,
        generos: filtros.generos,
        marcas: filtros.marcas,
        tallas: filtros.tallas,
        precio_min,
        precio_max,
      });
      if (!r.success || !r.data) {
        setError(r.msg);
        return;
      }
      alGuardar({
        id: r.data.id,
        nombre: nombre.trim().replace(/\s+/g, " "),
        descripcion: descripcion.trim(),
        base: false,
        activo: true,
        categorias: filtros.categorias,
        grupos: filtros.grupos,
        generos: filtros.generos,
        marcas: filtros.marcas,
        tallas: filtros.tallas,
        precio_min,
        precio_max,
      });
      setAbierto(false);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={abrir}>
        <BookmarkPlus data-icon="inline-start" /> Guardar como tipo
      </Button>
      <Dialog open={abierto} onOpenChange={(o) => !pendiente && setAbierto(o)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={guardar} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Guardar como tipo de catálogo</DialogTitle>
              <DialogDescription>
                Queda junto a Hombres, Mujeres, etc. Al elegirlo se llenan estos filtros; puedes asociarle una portada y cambiarlo cuando quieras en Catálogos → Tipos.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="tipo-nombre">Nombre</Label>
              <Input id="tipo-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={40} required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tipo-descripcion">Descripción (opcional)</Label>
              <Input id="tipo-descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={120} placeholder="Para qué se usa" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAbierto(false)} disabled={pendiente}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pendiente || nombre.trim().length < 2}>
                {pendiente ? "Guardando…" : "Guardar tipo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
