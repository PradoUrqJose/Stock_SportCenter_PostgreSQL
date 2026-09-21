"use client";

// Tipos de catálogo: los 9 de fábrica y los que crea Marketing. Todos hacen lo mismo: llenan los filtros del asistente
// con un clic, llevan una portada asociada y sus páginas automáticas (términos, redes…, que se asocian en Diseños).
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { actualizarTipo, activarTipo, asociarPortada, crearTipo, eliminarTipo, restaurarTipo } from "@/lib/actions/marketing-tipos";
import { portadaDelTipo, type FijaBiblioteca, type TipoCatalogo } from "@/lib/marketing-catalogo";
import { cn } from "@/lib/utils";
import type { Opciones } from "./asistente-catalogo";

type Portada = FijaBiblioteca & { activa: boolean };

/** Los filtros de un tipo en frases cortas (las listas largas se resumen). */
function frases(t: TipoCatalogo): string[] {
  const lista = (nombre: string, v: string[]) => v.length > 0 && `${nombre}: ${v.length > 5 ? `${v.slice(0, 4).join(", ")} y ${v.length - 4} más` : v.join(", ")}`;
  const precio =
    t.precio_min != null && t.precio_max != null ? `Precio: S/ ${t.precio_min}–${t.precio_max}` : t.precio_min != null ? `Precio desde S/ ${t.precio_min}` : t.precio_max != null ? `Precio hasta S/ ${t.precio_max}` : false;
  return [lista("Categoría", t.categorias), lista("Grupo", t.grupos), lista("Género", t.generos), lista("Marca", t.marcas), lista("Talla", t.tallas), precio].filter((x): x is string => Boolean(x));
}

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

type Borrador = { nombre: string; descripcion: string; categorias: string[]; grupos: string[]; generos: string[]; marcas: string[]; tallas: string[]; precioMin: string; precioMax: string };
const vacio: Borrador = { nombre: "", descripcion: "", categorias: [], grupos: [], generos: [], marcas: [], tallas: [], precioMin: "", precioMax: "" };
const deTipo = (t: TipoCatalogo): Borrador => ({
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

export function GestorTipos({ tipos, portadas, opciones, base }: { tipos: TipoCatalogo[]; portadas: Portada[]; opciones: Opciones; base: string }) {
  const router = useRouter();
  const [, iniciar] = useTransition();
  const [edicion, setEdicion] = useState<{ id: string | null; datos: Borrador } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [aBorrar, setABorrar] = useState<TipoCatalogo | null>(null);
  const [aRestaurar, setARestaurar] = useState<TipoCatalogo | null>(null);
  const activas = useMemo(() => portadas.filter((p) => p.activa), [portadas]);

  function accion(f: () => Promise<{ success: boolean; msg: string }>) {
    setAviso(null);
    iniciar(async () => {
      const r = await f();
      setAviso({ ok: r.success, texto: r.msg });
      if (r.success) router.refresh();
    });
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!edicion) return;
    const d = edicion.datos;
    setGuardando(true);
    setError(null);
    const entrada = { nombre: d.nombre, descripcion: d.descripcion, categorias: d.categorias, grupos: d.grupos, generos: d.generos, marcas: d.marcas, tallas: d.tallas, precio_min: numero(d.precioMin), precio_max: numero(d.precioMax) };
    const r = edicion.id ? await actualizarTipo(edicion.id, entrada) : await crearTipo(entrada);
    setGuardando(false);
    if (!r.success) {
      setError(r.msg);
      return;
    }
    setEdicion(null);
    setAviso({ ok: true, texto: r.msg });
    router.refresh();
  }

  const cambiar = (parte: Partial<Borrador>) => setEdicion((s) => (s ? { ...s, datos: { ...s.datos, ...parte } } : s));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Un tipo llena los filtros del asistente con un clic y lleva su portada asociada. Los cambios valen para los catálogos que se generen desde ahora; los ya generados no cambian.
        </p>
        <Button onClick={() => { setError(null); setEdicion({ id: null, datos: vacio }); }}>
          <Plus data-icon="inline-start" /> Nuevo tipo
        </Button>
      </div>

      {aviso && <p className={cn("mb-4 text-sm", aviso.ok ? "text-green-600" : "text-destructive")}>{aviso.texto}</p>}

      <ul className="grid gap-3 lg:grid-cols-2">
        {tipos.map((t) => {
          const portada = portadaDelTipo(t.id, activas);
          return (
            <li key={t.id} className={cn("rounded-xl border border-border p-4", !t.activo && "opacity-60")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                    {t.nombre}
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">{t.base ? "De fábrica" : "Personalizado"}</span>
                    {!t.activo && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-normal text-amber-800">Desactivado</span>}
                  </p>
                  {t.descripcion && <p className="mt-0.5 text-xs text-muted-foreground">{t.descripcion}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="outline" size="icon-sm" aria-label={`Editar ${t.nombre}`} title="Editar" onClick={() => { setError(null); setEdicion({ id: t.id, datos: deTipo(t) }); }}>
                    <Pencil />
                  </Button>
                  {t.base ? (
                    <Button variant="outline" size="icon-sm" aria-label={`Restaurar ${t.nombre}`} title="Volver a los filtros de fábrica" onClick={() => setARestaurar(t)}>
                      <RotateCcw />
                    </Button>
                  ) : (
                    <Button variant="outline" size="icon-sm" aria-label={`Borrar ${t.nombre}`} title="Borrar" onClick={() => setABorrar(t)}>
                      <Trash2 />
                    </Button>
                  )}
                </div>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">{frases(t).join(" · ") || "Sin filtros"}</p>

              <div className="mt-3 flex items-center gap-3 border-t border-border pt-3">
                {portada ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${base}/${portada.imagen}-min.webp`} alt="" className="h-9 w-16 shrink-0 rounded border border-border object-cover" />
                ) : (
                  <span className="flex h-9 w-16 shrink-0 items-center justify-center rounded border border-dashed border-border text-[10px] text-muted-foreground">Sin portada</span>
                )}
                <label className="min-w-0 flex-1 text-xs text-muted-foreground">
                  Portada asociada
                  <select
                    className="mt-0.5 h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring dark:bg-input/30"
                    value={portada?.id ?? ""}
                    onChange={(e) => accion(() => asociarPortada(t.id, e.target.value || null))}
                  >
                    <option value="">Ninguna (se elige al generar)</option>
                    {activas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <Button variant="ghost" size="sm" onClick={() => accion(() => activarTipo(t.id, !t.activo))}>
                  {t.activo ? "Desactivar" : "Activar"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={edicion !== null} onOpenChange={(o) => !guardando && !o && setEdicion(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {edicion && (
            <form onSubmit={guardar} className="space-y-4">
              <DialogHeader>
                <DialogTitle>{edicion.id ? "Editar tipo" : "Nuevo tipo"}</DialogTitle>
                <DialogDescription>Estos son los filtros que se llenan al elegir el tipo en el asistente. Se pueden ajustar al crear cada catálogo.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="t-nombre">Nombre</Label>
                  <Input id="t-nombre" value={edicion.datos.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} maxLength={40} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="t-desc">Descripción (opcional)</Label>
                  <Input id="t-desc" value={edicion.datos.descripcion} onChange={(e) => cambiar({ descripcion: e.target.value })} maxLength={120} />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <MultiSelectFilter label="Categoría" options={opciones.categorias} selected={edicion.datos.categorias} onChange={(v) => cambiar({ categorias: v })} />
                  <MultiSelectFilter label="Grupo" options={opciones.grupos} selected={edicion.datos.grupos} onChange={(v) => cambiar({ grupos: v })} />
                  <MultiSelectFilter label="Género" options={opciones.generos} selected={edicion.datos.generos} onChange={(v) => cambiar({ generos: v })} />
                  <MultiSelectFilter label="Marca" options={opciones.marcas} selected={edicion.datos.marcas} onChange={(v) => cambiar({ marcas: v })} />
                  <MultiSelectFilter label="Talla" options={opciones.tallas} selected={edicion.datos.tallas} onChange={(v) => cambiar({ tallas: v })} />
                </div>
                <Chips valores={edicion.datos.categorias.map((x) => `Categoría ${x}`)} alQuitar={(v) => cambiar({ categorias: edicion.datos.categorias.filter((x) => `Categoría ${x}` !== v) })} />
                <Chips valores={edicion.datos.grupos} alQuitar={(v) => cambiar({ grupos: edicion.datos.grupos.filter((x) => x !== v) })} />
                <Chips valores={edicion.datos.generos} alQuitar={(v) => cambiar({ generos: edicion.datos.generos.filter((x) => x !== v) })} />
                <Chips valores={edicion.datos.marcas} alQuitar={(v) => cambiar({ marcas: edicion.datos.marcas.filter((x) => x !== v) })} />
                <Chips valores={edicion.datos.tallas.map((x) => `Talla ${x}`)} alQuitar={(v) => cambiar({ tallas: edicion.datos.tallas.filter((x) => `Talla ${x}` !== v) })} />
                <p className="text-xs text-muted-foreground">Necesita al menos una categoría, grupo, género o marca. Solo la talla o el precio traerían todo el ERP.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Precio lista (S/, opcional)</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" inputMode="decimal" min={0} value={edicion.datos.precioMin} onChange={(e) => cambiar({ precioMin: e.target.value })} placeholder="Desde" className="w-32" aria-label="Precio desde" />
                  <span className="text-sm text-muted-foreground">a</span>
                  <Input type="number" inputMode="decimal" min={0} value={edicion.datos.precioMax} onChange={(e) => cambiar({ precioMax: e.target.value })} placeholder="Hasta" className="w-32" aria-label="Precio hasta" />
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEdicion(null)} disabled={guardando}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={guardando || edicion.datos.nombre.trim().length < 2}>
                  {guardando ? "Guardando…" : "Guardar"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={aBorrar !== null}
        onOpenChange={(o) => !o && setABorrar(null)}
        title={`Borrar «${aBorrar?.nombre ?? ""}»`}
        description="El tipo deja de aparecer en el asistente y en Diseños. Los catálogos ya generados no cambian."
        confirmLabel="Borrar"
        variant="destructive"
        onConfirm={() => eliminarTipo(aBorrar!.id)}
        onSuccess={() => router.refresh()}
      />
      <ConfirmDialog
        open={aRestaurar !== null}
        onOpenChange={(o) => !o && setARestaurar(null)}
        title={`Restaurar «${aRestaurar?.nombre ?? ""}»`}
        description="Vuelve a su nombre, descripción y filtros de fábrica, y lo activa. Su portada asociada no cambia."
        confirmLabel="Restaurar"
        variant="warning"
        onConfirm={() => restaurarTipo(aRestaurar!.id)}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
