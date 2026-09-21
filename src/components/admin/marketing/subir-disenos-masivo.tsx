"use client";

// Subida masiva de diseños (plantillas de zapatilla, portadas, separadores, cierres). Cada archivo se
// clasifica por su NOMBRE (PLANTILLA NIKE, PORTADA HOMBRES, TERMINOS Y CONDICIONES…) y antes de subir se
// puede corregir todo en una tabla. Si ya existe un diseño con el mismo nombre, se reemplaza su imagen.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ImagePlus, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MARCA_GENERICA } from "@/lib/marketing-catalogo";
import { claveNombre, interpretarNombreDiseno, type DisenoInterpretado } from "@/lib/marketing-disenos-nombres";
import { enviarDiseno, prepararPaginaFija } from "@/lib/subir-imagen-cliente";
import { cn } from "@/lib/utils";

const SELECT =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

type Clase = "plantilla" | "portada" | "separador" | "cierre" | "otra";
type Fila = {
  id: number;
  archivo: File;
  miniatura: string;
  clase: Clase;
  marca: string;
  nombre: string;
  /** "" = a mano; hombre | mujer | ninos | futbol | * */
  aplica: string;
  posicion: "" | "inicio" | "final";
  estado: "pendiente" | "subiendo" | "ok" | "reemplazo" | "error";
  error?: string;
};

const CLASES: { valor: Clase; texto: string }[] = [
  { valor: "plantilla", texto: "Plantilla de marca" },
  { valor: "portada", texto: "Portada" },
  { valor: "separador", texto: "Separador" },
  { valor: "cierre", texto: "Cierre (términos, redes)" },
  { valor: "otra", texto: "Otra" },
];
/** Opciones de «dónde se usa» una página fija: a mano, cada tipo de catálogo (de fábrica y personalizados) o todos. */
const usosDe = (tipos: readonly { id: string; nombre: string }[]) => [{ valor: "", texto: "A mano" }, ...tipos.map((t) => ({ valor: t.id, texto: t.nombre })), { valor: "*", texto: "Todos" }];

function aFila(id: number, archivo: File, marcas: string[]): Fila {
  const d: DisenoInterpretado = interpretarNombreDiseno(archivo.name, marcas);
  return {
    id,
    archivo,
    miniatura: URL.createObjectURL(archivo),
    clase: d.clase === "plantilla" ? "plantilla" : d.tipo,
    marca: d.marca,
    nombre: d.nombre,
    aplica: d.aplica[0] ?? "",
    posicion: d.posicion,
    estado: "pendiente",
  };
}

export function SubirDisenosMasivo({ marcas, tipos, className }: { marcas: string[]; tipos: { id: string; nombre: string }[]; className?: string }) {
  const USOS = usosDe(tipos);
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const contador = useRef(0);
  const filasRef = useRef<Fila[]>([]);

  useEffect(() => {
    filasRef.current = filas;
  }, [filas]);
  // Al cerrar el diálogo se liberan las miniaturas.
  useEffect(() => () => filasRef.current.forEach((f) => URL.revokeObjectURL(f.miniatura)), []);

  const cambiar = (id: number, parte: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, ...parte } : f)));
  const quitar = (id: number) =>
    setFilas((fs) => {
      const f = fs.find((x) => x.id === id);
      if (f) URL.revokeObjectURL(f.miniatura);
      return fs.filter((x) => x.id !== id);
    });

  function agregar(lista: FileList | File[]) {
    const imagenes = [...lista].filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type));
    setFilas((fs) => [...fs, ...imagenes.map((f) => aFila(++contador.current, f, marcas))]);
  }

  function cerrar() {
    if (subiendo) return;
    filasRef.current.forEach((f) => URL.revokeObjectURL(f.miniatura));
    setFilas([]);
    setAbierto(false);
  }

  async function subirTodos() {
    setSubiendo(true);
    const pendientes = filas.filter((f) => f.estado === "pendiente" || f.estado === "error");
    // De a dos a la vez: cada imagen se reduce en el navegador y se procesa en el servidor.
    let siguiente = 0;
    const trabajador = async () => {
      while (siguiente < pendientes.length) {
        const f = pendientes[siguiente++];
        cambiar(f.id, { estado: "subiendo", error: undefined });
        try {
          const blob = await prepararPaginaFija(f.archivo);
          const r =
            f.clase === "plantilla"
              ? await enviarDiseno(blob, { clase: "plantilla", marca: f.marca, nombre: f.nombre })
              : await enviarDiseno(blob, { clase: "fija", tipo: f.clase, nombre: f.nombre, aplica: f.aplica, posicion: f.posicion });
          cambiar(f.id, r.ok ? { estado: r.reemplazo ? "reemplazo" : "ok" } : { estado: "error", error: r.error });
        } catch (e) {
          cambiar(f.id, { estado: "error", error: e instanceof Error ? e.message : "No se pudo procesar la imagen" });
        }
      }
    };
    await Promise.all([trabajador(), trabajador()]);
    setSubiendo(false);
    router.refresh();
  }

  const porSubir = filas.filter((f) => f.estado === "pendiente" || f.estado === "error");
  // Dos archivos de la lista con el mismo nombre serían el mismo diseño (el segundo reemplazaría al primero).
  const identidad = (f: Fila) => `${f.clase === "plantilla" ? `p:${f.marca}` : `f:${f.clase}`}|${claveNombre(f.nombre)}`;
  const repetida = (f: Fila) => filas.filter((x) => identidad(x) === identidad(f)).length > 1;
  const invalida = (f: Fila) => f.nombre.trim().length < 2 || (f.clase === "plantilla" && !f.marca.trim()) || repetida(f);
  const hechas = filas.filter((f) => f.estado === "ok" || f.estado === "reemplazo").length;
  const hayGenerica = filas.some((f) => f.clase === "plantilla" && f.marca === MARCA_GENERICA);

  return (
    <>
      <Button variant="outline" className={className} onClick={() => setAbierto(true)}>
        <Upload data-icon="inline-start" /> Subir diseños
      </Button>
      <Dialog open={abierto} onOpenChange={(o) => !o && cerrar()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Subir diseños</DialogTitle>
            <DialogDescription>
              Elige todos los archivos a la vez: se clasifican por su nombre y puedes corregir cada uno antes de subir. Si ya existe un diseño con el mismo nombre, se reemplaza su imagen.
            </DialogDescription>
          </DialogHeader>

          <label
            onDragOver={(e) => {
              e.preventDefault();
              setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastrando(false);
              if (!subiendo) agregar(e.dataTransfer.files);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
              arrastrando ? "border-foreground bg-muted" : "border-border hover:bg-muted/50",
              subiendo && "pointer-events-none opacity-60"
            )}
          >
            <ImagePlus className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Arrastra los diseños aquí o haz clic para elegirlos</span>
            <span className="text-xs text-muted-foreground">JPG, PNG o WebP en formato 16:9</span>
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) agregar(e.target.files);
                e.target.value = "";
              }}
            />
          </label>

          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Nombres que se reconocen:</span> <code>PLANTILLA NIKE</code> · <code>PLANTILLA NIKE NAVIDAD</code> (otra de la misma marca) · <code>PLANTILLA GENERICA</code> ·{" "}
            <code>PORTADA HOMBRES</code> (también MUJERES y NIÑOS) · <code>SEPARADOR FUTBOL LOSA</code> · <code>TERMINOS Y CONDICIONES</code> · <code>REDES</code>
          </p>

          {filas.length > 0 && (
            <ul className="space-y-2">
              {filas.map((f) => (
                <li key={f.id} className="grid items-center gap-2 rounded-lg border border-border p-2 sm:grid-cols-[5rem_1fr_12rem_14rem_2rem]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.miniatura} alt="" className="aspect-video w-20 rounded object-cover sm:w-full" />
                  <div className="min-w-0 space-y-1">
                    <Input value={f.nombre} onChange={(e) => cambiar(f.id, { nombre: e.target.value })} maxLength={60} disabled={subiendo || f.estado === "ok" || f.estado === "reemplazo"} aria-label="Nombre" />
                    <p className={cn("truncate text-[11px]", repetida(f) ? "text-destructive" : "text-muted-foreground")} title={f.archivo.name}>
                      {repetida(f) ? "Nombre repetido en la lista: cámbialo para que sean diseños distintos" : f.archivo.name}
                    </p>
                  </div>
                  <select className={SELECT} value={f.clase} onChange={(e) => cambiar(f.id, { clase: e.target.value as Clase, ...(e.target.value === "portada" && f.aplica ? { posicion: "inicio" as const } : {}) })} disabled={subiendo || f.estado === "ok" || f.estado === "reemplazo"} aria-label="Clase de diseño">
                    {CLASES.map((c) => (
                      <option key={c.valor} value={c.valor}>
                        {c.texto}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-1.5">
                    {f.clase === "plantilla" ? (
                      <select className={SELECT} value={f.marca} onChange={(e) => cambiar(f.id, { marca: e.target.value })} disabled={subiendo || f.estado === "ok" || f.estado === "reemplazo"} aria-label="Marca">
                        <option value="">Marca…</option>
                        <option value={MARCA_GENERICA}>Genérica (sin marca)</option>
                        {marcas.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                        {f.marca && f.marca !== MARCA_GENERICA && !marcas.includes(f.marca) && <option value={f.marca}>{f.marca}</option>}
                      </select>
                    ) : (
                      <>
                        <select
                          className={SELECT}
                          value={f.aplica}
                          onChange={(e) => cambiar(f.id, { aplica: e.target.value, posicion: e.target.value === "" ? "" : f.clase === "portada" ? "inicio" : f.posicion })}
                          disabled={subiendo || f.estado === "ok" || f.estado === "reemplazo"}
                          aria-label="Se usa en"
                          title="Se usa en"
                        >
                          {USOS.map((u) => (
                            <option key={u.valor} value={u.valor}>
                              {u.texto}
                            </option>
                          ))}
                        </select>
                        <select
                          className={SELECT}
                          value={f.posicion}
                          onChange={(e) => cambiar(f.id, { posicion: e.target.value as Fila["posicion"] })}
                          disabled={subiendo || f.aplica === "" || f.clase === "portada" || f.estado === "ok" || f.estado === "reemplazo"}
                          aria-label="Posición"
                          title="Posición"
                        >
                          <option value="">{f.aplica === "" ? "—" : "Sugerida"}</option>
                          <option value="inicio">Al inicio</option>
                          <option value="final">Al final</option>
                        </select>
                      </>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-1.5 sm:justify-center">
                    {f.estado === "subiendo" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Subiendo" />}
                    {(f.estado === "ok" || f.estado === "reemplazo") && <Check className="h-4 w-4 text-green-600" aria-label={f.estado === "reemplazo" ? "Reemplazado" : "Subido"} />}
                    {f.estado === "error" && <AlertTriangle className="h-4 w-4 text-destructive" aria-label="Error" />}
                    {(f.estado === "pendiente" || f.estado === "error") && !subiendo && (
                      <button type="button" onClick={() => quitar(f.id)} className="text-muted-foreground hover:text-foreground" aria-label="Quitar de la lista">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {f.estado === "reemplazo" && <p className="text-[11px] text-green-700 sm:col-span-5 dark:text-green-400">Ya existía con ese nombre: se reemplazó la imagen y se conservó lo demás.</p>}
                  {f.estado === "error" && <p className="text-[11px] text-destructive sm:col-span-5">{f.error}</p>}
                </li>
              ))}
            </ul>
          )}

          {filas.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void subirTodos()} disabled={subiendo || porSubir.length === 0 || porSubir.some(invalida)}>
                {subiendo ? "Subiendo…" : `Subir ${porSubir.length} diseño${porSubir.length === 1 ? "" : "s"}`}
              </Button>
              {hechas > 0 && !subiendo && <p className="text-sm text-muted-foreground">{hechas} listo{hechas === 1 ? "" : "s"}.</p>}
              {porSubir.some(invalida) && <p className="text-xs text-destructive">Revisa los nombres (sin repetir) y la marca de cada plantilla.</p>}
              {hayGenerica && <p className="text-xs text-muted-foreground">La genérica se usará con las marcas que no tengan plantilla propia.</p>}
              {hechas > 0 && porSubir.length === 0 && (
                <Button variant="outline" className="ml-auto" onClick={cerrar}>
                  Cerrar
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
