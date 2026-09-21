"use client";

// Subir UN diseño sin salir del asistente: una portada o la plantilla de una marca (o la genérica). Al terminar el
// diseño queda elegido en el catálogo que se está creando. Para muchos archivos a la vez sigue la subida masiva de
// Catálogos → Subir diseños.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { asociarPortada } from "@/lib/actions/marketing-tipos";
import { claveNombre } from "@/lib/marketing-disenos-nombres";
import { MARCA_GENERICA } from "@/lib/marketing-catalogo";
import { enviarDiseno, prepararPaginaFija } from "@/lib/subir-imagen-cliente";

export type DestinoSubida = { clase: "portada" } | { clase: "plantilla"; marca: string } | { clase: "separador_marca"; marca: string };

/** Nombre sugerido a partir del archivo: sin extensiones ni guiones bajos, y «Así» si venía TODO EN MAYÚSCULAS. */
export function nombreDesdeArchivo(archivo: string): string {
  const limpio = archivo.replace(/(\.(jpe?g|png|webp))+$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (limpio !== limpio.toUpperCase()) return limpio;
  return limpio.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

export function SubirDisenoAqui({
  destino,
  existentes,
  tipo,
  slotTipo,
  alSubir,
  alCerrar,
}: {
  destino: DestinoSubida;
  /** Nombres de los diseños que ya existen de esta clase (y de esta marca): con el mismo nombre se reemplazaría el existente. */
  existentes: string[];
  /** Tipo de catálogo elegido (null = filtros a mano). Solo importa para asociarle la portada. */
  tipo: { id: string; nombre: string } | null;
  /** Se muestra cuando no hay tipo, para poder guardar los filtros como tipo sin volver al paso 1. */
  slotTipo?: React.ReactNode;
  alSubir: (r: { id: string; reemplazo: boolean }) => void;
  alCerrar: () => void;
}) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  // El separador de marca ya tiene nombre (uno por marca): «Separador Adidas».
  const [nombre, setNombre] = useState(destino.clase === "separador_marca" ? `Separador ${nombreDesdeArchivo(destino.marca)}` : "");
  const [asociar, setAsociar] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esPortada = destino.clase === "portada";
  const esSeparador = destino.clase === "separador_marca";
  const titulo = esPortada ? "Subir portada" : esSeparador ? `Subir separador de ${destino.marca}` : destino.marca === MARCA_GENERICA ? "Subir plantilla genérica" : `Subir plantilla de ${destino.marca}`;
  const repetido = existentes.some((n) => claveNombre(n) === claveNombre(nombre));

  // Vista previa del archivo elegido; se libera la dirección temporal al cambiarlo o cerrar.
  const miniatura = useMemo(() => (archivo ? URL.createObjectURL(archivo) : null), [archivo]);
  useEffect(() => () => {
    if (miniatura) URL.revokeObjectURL(miniatura);
  }, [miniatura]);

  // La casilla solo vale si hay un tipo (si se guarda mientras el diálogo está abierto, se habilita sola, sin marcar).
  const asociarConTipo = asociar && tipo !== null;

  async function subir(e: React.FormEvent) {
    e.preventDefault();
    if (!archivo) return;
    setSubiendo(true);
    setError(null);
    try {
      const blob = await prepararPaginaFija(archivo);
      const r =
        destino.clase === "plantilla"
          ? await enviarDiseno(blob, { clase: "plantilla", marca: destino.marca, nombre: nombre.trim() })
          : destino.clase === "separador_marca"
            ? await enviarDiseno(blob, { clase: "fija", tipo: "separador_marca", nombre: nombre.trim(), aplica: "", posicion: "", marca: destino.marca })
            : await enviarDiseno(blob, { clase: "fija", tipo: "portada", nombre: nombre.trim(), aplica: "", posicion: "" });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // El diseño ya está subido y queda elegido; la asociación al tipo es un paso aparte que puede fallar por separado.
      alSubir({ id: r.id, reemplazo: r.reemplazo });
      router.refresh();
      if (esPortada && asociarConTipo && tipo) {
        const a = await asociarPortada(tipo.id, r.id);
        if (!a.success) {
          setError(`La portada se subió y se usa en este catálogo, pero no se pudo asociar al tipo: ${a.msg}`);
          return;
        }
      }
      alCerrar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo procesar la imagen");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !subiendo && alCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <form onSubmit={subir} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>
              {esPortada
                ? "Imagen horizontal en formato 16:9 (por ejemplo 2000×1125). Se usará en este catálogo y queda en la biblioteca de Diseños."
                : esSeparador
                  ? `Imagen horizontal 16:9 que dice ${destino.marca}. Irá antes de las páginas de esa marca en este catálogo y en todos los que separes por marcas; queda en la biblioteca de Diseños.`
                  : "Imagen horizontal 16:9 con la misma composición que las demás plantillas (código, tallas y precio en el mismo lugar): toma sus zonas de una plantilla existente."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="diseno-archivo">Imagen</Label>
            <Input
              id="diseno-archivo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={subiendo}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setArchivo(f);
                if (f && !esSeparador) setNombre(nombreDesdeArchivo(f.name));
              }}
            />
            {miniatura && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={miniatura} alt="Vista previa" className="mt-2 aspect-video w-full rounded-lg border border-border object-cover" />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="diseno-nombre">Nombre</Label>
            <Input id="diseno-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} disabled={subiendo} required />
            {repetido && nombre.trim() !== "" && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Ya existe un diseño con este nombre: se reemplazará su imagen (conserva su configuración). Usa otro nombre para agregar uno nuevo.
              </p>
            )}
          </div>

          {esPortada && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <label className={`flex items-start gap-2 text-sm ${tipo ? "" : "opacity-60"}`}>
                <Checkbox checked={asociarConTipo} onCheckedChange={(v) => setAsociar(v === true)} disabled={!tipo || subiendo} className="mt-0.5" />
                <span>
                  Usarla siempre en {tipo ? `«${tipo.nombre}»` : "este tipo"}
                  <span className="block text-xs text-muted-foreground">
                    {tipo
                      ? "Será la portada de ese tipo en todos los catálogos nuevos. Apagada, solo se usa en este."
                      : "Este catálogo tiene filtros a mano, sin tipo. Guarda los filtros como tipo para poder asociarle la portada."}
                  </span>
                </span>
              </label>
              {!tipo && slotTipo}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={alCerrar} disabled={subiendo}>
              {error && error.startsWith("La portada se subió") ? "Cerrar" : "Cancelar"}
            </Button>
            <Button type="submit" disabled={subiendo || !archivo || nombre.trim().length < 2}>
              {subiendo ? "Subiendo…" : "Subir y usar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
