"use client";

// Tipos de catálogo: los 9 de fábrica y los que crea Marketing. Todos hacen lo mismo: llenan los filtros del asistente
// con un clic, llevan una portada asociada y sus páginas automáticas (términos, redes…, que se asocian en Diseños).
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { actualizarTipo, activarTipo, asociarPortada, crearTipo, eliminarTipo, restaurarTipo } from "@/lib/actions/marketing-tipos";
import { portadaDelTipo, type FijaBiblioteca, type TipoCatalogo } from "@/lib/marketing-catalogo";
import { cn } from "@/lib/utils";
import type { Opciones } from "./asistente-catalogo";
import { BORRADOR_TIPO_VACIO, DialogoTipo, aEntradaTipo, borradorDeTipo, type BorradorTipo } from "./dialogo-tipo";

type Portada = FijaBiblioteca & { activa: boolean };

/** Los filtros de un tipo en frases cortas (las listas largas se resumen). */
function frases(t: TipoCatalogo): string[] {
  const lista = (nombre: string, v: string[]) => v.length > 0 && `${nombre}: ${v.length > 5 ? `${v.slice(0, 4).join(", ")} y ${v.length - 4} más` : v.join(", ")}`;
  const precio =
    t.precio_min != null && t.precio_max != null ? `Precio: S/ ${t.precio_min}–${t.precio_max}` : t.precio_min != null ? `Precio desde S/ ${t.precio_min}` : t.precio_max != null ? `Precio hasta S/ ${t.precio_max}` : false;
  return [lista("Categoría", t.categorias), lista("Grupo", t.grupos), lista("Género", t.generos), lista("Marca", t.marcas), lista("Talla", t.tallas), precio].filter((x): x is string => Boolean(x));
}

export function GestorTipos({ tipos, portadas, opciones, base }: { tipos: TipoCatalogo[]; portadas: Portada[]; opciones: Opciones; base: string }) {
  const router = useRouter();
  const [, iniciar] = useTransition();
  const [edicion, setEdicion] = useState<{ id: string | null; inicial: BorradorTipo } | null>(null);
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

  async function guardar(datos: BorradorTipo) {
    if (!edicion) return { success: false, msg: "Sin tipo" };
    const r = edicion.id ? await actualizarTipo(edicion.id, aEntradaTipo(datos)) : await crearTipo(aEntradaTipo(datos));
    if (r.success) {
      setAviso({ ok: true, texto: r.msg });
      router.refresh();
    }
    return r;
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Un tipo llena los filtros del asistente con un clic y lleva su portada asociada. Los cambios valen para los catálogos que se generen desde ahora; los ya generados no cambian.
        </p>
        <Button onClick={() => setEdicion({ id: null, inicial: BORRADOR_TIPO_VACIO })}>
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
                  <Button variant="outline" size="icon-sm" aria-label={`Editar ${t.nombre}`} title="Editar" onClick={() => setEdicion({ id: t.id, inicial: borradorDeTipo(t) })}>
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

      {edicion && (
        <DialogoTipo
          key={edicion.id ?? "nuevo"}
          titulo={edicion.id ? "Editar tipo" : "Nuevo tipo"}
          inicial={edicion.inicial}
          opciones={opciones}
          alGuardar={guardar}
          alCerrar={() => setEdicion(null)}
        />
      )}

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
