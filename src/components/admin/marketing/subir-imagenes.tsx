"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { consultarCodigosExistentes } from "@/lib/actions/marketing-imagenes";
import { codigoDesdeArchivo, codigoValido, normalizarCodigo } from "@/lib/marketing-codigos";
import { estandarizarImagen } from "@/lib/estandarizar-imagen";
import { enviarImagen } from "@/lib/subir-imagen-cliente";
import { cn } from "@/lib/utils";

type Estado = "listo" | "subiendo" | "ok" | "error" | "omitida";
type Item = {
  id: number;
  archivo: File;
  codigo: string;
  estado: Estado;
  /** true si el código ya tiene imagen registrada (se reemplazaría). */
  existe: boolean;
  mensaje?: string;
};

const MAX_ARCHIVOS = 500;
const HILOS = 3;

let siguienteId = 1;

export function SubirImagenes() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [reemplazar, setReemplazar] = useState(false);
  const [corriendo, setCorriendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cambiar = (id: number, parche: Partial<Item>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...parche } : i)));

  const repetidos = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const i of items) if (i.codigo) cuenta.set(i.codigo, (cuenta.get(i.codigo) ?? 0) + 1);
    return new Set([...cuenta].filter(([, n]) => n > 1).map(([c]) => c));
  }, [items]);

  // Un ítem se puede enviar si tiene código válido, no está repetido y (si ya
  // existe) el usuario aceptó reemplazar.
  const problema = (i: Item): string | null => {
    if (!i.codigo) return "Escribe el código";
    if (!codigoValido(i.codigo)) return "Código inválido";
    if (repetidos.has(i.codigo)) return "Código repetido en el lote";
    if (i.existe && !reemplazar) return "Ya existe (marca «Reemplazar»)";
    return null;
  };
  const pendientes = items.filter((i) => (i.estado === "listo" || i.estado === "error") && !problema(i));

  async function marcarExistentes(ids: number[], codigos: string[]) {
    const r = await consultarCodigosExistentes(codigos);
    if (!r.success) return;
    const existentes = new Set(r.data);
    setItems((prev) =>
      prev.map((i) => (ids.includes(i.id) ? { ...i, existe: existentes.has(i.codigo) } : i))
    );
  }

  async function agregar(lista: FileList | File[]) {
    const archivos = Array.from(lista).filter((f) => f.type === "image/png" || f.type === "image/webp");
    const omitidos = Array.from(lista).length - archivos.length;
    const cupo = MAX_ARCHIVOS - items.length;
    const nuevos: Item[] = archivos.slice(0, Math.max(0, cupo)).map((archivo) => ({
      id: siguienteId++,
      archivo,
      codigo: codigoDesdeArchivo(archivo.name),
      estado: "listo",
      existe: false,
    }));
    const partes: string[] = [];
    if (omitidos > 0) partes.push(`${omitidos} ignorado(s) por no ser PNG/WebP`);
    if (archivos.length > nuevos.length) partes.push(`${archivos.length - nuevos.length} ignorado(s) por el tope de ${MAX_ARCHIVOS} por carga`);
    setAviso(partes.length ? partes.join(" · ") : null);
    setItems((prev) => [...prev, ...nuevos]);
    const conCodigo = nuevos.filter((n) => n.codigo);
    if (conCodigo.length) await marcarExistentes(conCodigo.map((n) => n.id), conCodigo.map((n) => n.codigo));
  }

  async function subir() {
    setCorriendo(true);
    const cola = [...pendientes];
    const trabajador = async () => {
      for (let item = cola.shift(); item; item = cola.shift()) {
        cambiar(item.id, { estado: "subiendo", mensaje: undefined });
        try {
          const est = await estandarizarImagen(item.archivo);
          URL.revokeObjectURL(est.vistaPrevia);
          const r = await enviarImagen(item.codigo, est.blob, item.existe ? "reemplazo" : "nueva");
          if (r.ok) {
            cambiar(item.id, {
              estado: "ok",
              existe: true,
              mensaje: `v${r.version}${est.avisos.length ? ` · ${est.avisos[0]}` : ""}`,
            });
          } else {
            cambiar(item.id, { estado: "error", mensaje: r.error });
          }
        } catch (e) {
          cambiar(item.id, { estado: "error", mensaje: e instanceof Error ? e.message : "Error inesperado" });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(HILOS, cola.length) }, trabajador));
    setCorriendo(false);
    router.refresh();
  }

  function cerrar(abierto: boolean) {
    if (corriendo) return; // no cerrar a mitad de una carga
    setOpen(abierto);
    if (!abierto) {
      setItems([]);
      setReemplazar(false);
      setAviso(null);
    }
  }

  const ok = items.filter((i) => i.estado === "ok").length;
  const fallidas = items.filter((i) => i.estado === "error").length;

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UploadCloud data-icon="inline-start" /> Subir imágenes
      </Button>

      <Dialog open={open} onOpenChange={cerrar}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Subir imágenes</DialogTitle>
            <DialogDescription>
              PNG o WebP con fondo transparente. El nombre del archivo es el código
              (<span className="font-mono">JS2322.png</span>); si no lo es, escríbelo abajo.
              Se recortan y centran solas en 1600×1600 y se guardan en R2 y en la base de datos.
            </DialogDescription>
          </DialogHeader>

          <div
            onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastrando(false); agregar(e.dataTransfer.files); }}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground transition-colors",
              arrastrando && "border-primary bg-muted/50"
            )}
          >
            <UploadCloud className="h-6 w-6" />
            <p>Arrastra aquí una o varias imágenes (hasta {MAX_ARCHIVOS})</p>
            <Button type="button" variant="outline" size="sm" disabled={corriendo} onClick={() => inputRef.current?.click()}>
              Elegir archivos
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/png,image/webp"
              className="hidden"
              onChange={(e) => { if (e.target.files) agregar(e.target.files); e.target.value = ""; }}
            />
          </div>

          {aviso && <p className="text-xs text-amber-600 dark:text-amber-400">{aviso}</p>}

          {items.length > 0 && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={reemplazar} onCheckedChange={(v) => setReemplazar(v === true)} disabled={corriendo} />
                Reemplazar las que ya existen (se guarda una copia de la anterior)
              </label>

              <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {items.map((i) => {
                  const p = i.estado === "listo" || i.estado === "error" ? problema(i) : null;
                  return (
                    <li key={i.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="w-28 shrink-0 truncate text-xs text-muted-foreground sm:w-40" title={i.archivo.name}>
                        {i.archivo.name}
                      </span>
                      <Input
                        value={i.codigo}
                        disabled={corriendo || i.estado === "ok" || i.estado === "subiendo"}
                        onChange={(e) => cambiar(i.id, { codigo: normalizarCodigo(e.target.value), existe: false, estado: "listo", mensaje: undefined })}
                        onBlur={() => i.codigo && codigoValido(i.codigo) && marcarExistentes([i.id], [i.codigo])}
                        placeholder="Código"
                        className="h-7 w-28 shrink-0 font-mono text-xs sm:w-36"
                      />
                      <span
                        className={cn(
                          "min-w-0 flex-1 text-xs leading-snug",
                          i.estado === "ok" && "text-green-600 dark:text-green-400",
                          (i.estado === "error" || p) && "text-destructive",
                          i.estado === "subiendo" && "text-muted-foreground"
                        )}
                        title={i.mensaje ?? p ?? undefined}
                      >
                        {i.estado === "ok" && `Subida · ${i.mensaje}`}
                        {i.estado === "subiendo" && "Subiendo…"}
                        {i.estado === "error" && (i.mensaje ?? "Error")}
                        {i.estado === "listo" && (p ?? (i.existe ? "Reemplazará la actual" : "Nueva"))}
                      </span>
                      {!corriendo && i.estado !== "subiendo" && (
                        <button
                          type="button"
                          aria-label="Quitar"
                          onClick={() => setItems((prev) => prev.filter((x) => x.id !== i.id))}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {ok > 0 && `${ok} subidas`}
                  {ok > 0 && fallidas > 0 && " · "}
                  {fallidas > 0 && `${fallidas} con error`}
                  {ok === 0 && fallidas === 0 && `${items.length} archivo(s)`}
                </p>
                <Button onClick={subir} disabled={corriendo || pendientes.length === 0}>
                  {corriendo ? "Subiendo…" : `Subir ${pendientes.length} imagen${pendientes.length === 1 ? "" : "es"}`}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
