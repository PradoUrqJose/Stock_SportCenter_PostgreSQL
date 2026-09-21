"use client";

// Módulo Tallas: las equivalencias USA ⇄ Perú por marca y género. Se editan aquí, en el navegador, o se suben masivamente
// con un Excel (plantilla descargable; también se pueden bajar las tablas actuales, editarlas y volver a subirlas).
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, FileSpreadsheet, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { aplicarImportacionTallas, eliminarTablaTallas, guardarTablaTallas, vistaPreviaTallas, type VistaTabla } from "@/lib/actions/marketing-tallas";
import { leerArchivoTallas } from "@/lib/marketing-tallas-archivo";
import { GENEROS_TALLAS, etiquetaPeru, type AvisoTallas, type ErrorFila, type FilaEntrada, type TablaTallas } from "@/lib/marketing-tallas";
import { cn } from "@/lib/utils";

const SELECT = "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

type FilaForm = { peru: string; usa: string; pie: string };
type Borrador = { original?: { marca: string; genero: string }; marca: string; genero: string; filas: FilaForm[] };

const vacia = (): FilaForm => ({ peru: "", usa: "", pie: "" });
const desdeTabla = (t: TablaTallas): Borrador => ({
  original: { marca: t.marca, genero: t.genero },
  marca: t.marca,
  genero: t.genero,
  filas: t.filas.map((f) => ({ peru: etiquetaPeru(f.peru), usa: f.usa, pie: f.pie_cm === null ? "" : String(f.pie_cm) })),
});

/** Filas pegadas desde Excel: columnas PERU, USA y PIE separadas por tabulador o «;». */
function filasPegadas(texto: string): FilaForm[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const c = l.includes("\t") ? l.split("\t") : l.includes(";") ? l.split(";") : l.split(/\s{2,}|\s+/);
      return { peru: (c[0] ?? "").trim(), usa: (c[1] ?? "").trim(), pie: (c[2] ?? "").trim() };
    })
    // Una fila de encabezados pegada por error («PERU  USA  PIE») no es una talla.
    .filter((f) => !/^[A-Za-z]/.test(f.peru));
}

export function GestorTallas({ tablas, faltantes, marcas }: { tablas: TablaTallas[]; faltantes: AvisoTallas[]; marcas: string[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<Borrador | null>(null);
  const [importando, setImportando] = useState(false);
  const [aBorrar, setABorrar] = useState<TablaTallas | null>(null);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  const porMarca = useMemo(() => {
    const m = new Map<string, TablaTallas[]>();
    for (const t of tablas) (m.get(t.marca) ?? m.set(t.marca, []).get(t.marca)!).push(t);
    return [...m];
  }, [tablas]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setEditando({ marca: "", genero: "HOMBRE", filas: [vacia()] })}>
          <Plus data-icon="inline-start" /> Nueva equivalencia
        </Button>
        <Button variant="outline" onClick={() => setImportando(true)}>
          <Upload data-icon="inline-start" /> Subir Excel
        </Button>
        <a href="/api/marketing/tallas/plantilla" className={cn(buttonVariants({ variant: "outline" }))}>
          <FileSpreadsheet data-icon="inline-start" /> Descargar plantilla vacía
        </a>
        <a href="/api/marketing/tallas/exportar" className={cn(buttonVariants({ variant: "ghost" }), tablas.length === 0 && "pointer-events-none opacity-50")} aria-disabled={tablas.length === 0}>
          <Download data-icon="inline-start" /> Descargar las actuales
        </a>
      </div>

      {mensaje && <p className={cn("text-sm", mensaje.ok ? "text-green-600 dark:text-green-400" : "text-destructive")}>{mensaje.texto}</p>}

      {faltantes.length > 0 && (
        <section className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> Faltan equivalencias: estas marcas y géneros salen con talla USA
          </p>
          <p className="mt-0.5 pl-6 text-xs text-amber-800/80 dark:text-amber-300/80">Productos con stock y talla de calzado, según lo que STOCK tiene hoy. Los UNISEX usan la tabla de HOMBRE de su marca.</p>
          <ul className="mt-2 flex flex-wrap gap-2 pl-6">
            {faltantes.map((f) => (
              <li key={`${f.marca}|${f.genero}`}>
                <button
                  type="button"
                  onClick={() => setEditando({ marca: f.marca, genero: f.genero, filas: [vacia()] })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/50 bg-background px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted"
                  title="Agregar la equivalencia"
                >
                  <Plus className="h-3 w-3" />
                  <span className="font-medium">{f.marca}</span> · {f.genero}
                  <span className="text-muted-foreground">({f.productos.toLocaleString("en-US")})</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {porMarca.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Todavía no hay equivalencias. Crea una con «Nueva equivalencia» o sube el Excel con las de todas las marcas.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {porMarca.map(([marca, lista]) => (
            <section key={marca} className="rounded-lg border border-border bg-card">
              <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold text-foreground">{marca}</h2>
              <ul className="divide-y divide-border text-sm">
                {lista.map((t) => {
                  const peru = t.filas.map((f) => f.peru);
                  return (
                    <li key={t.genero} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{t.genero}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t.filas.length} tallas · Perú {etiquetaPeru(Math.min(...peru))}–{etiquetaPeru(Math.max(...peru))} · USA {t.filas[0].usa}–{t.filas[t.filas.length - 1].usa}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => setEditando(desdeTabla(t))}>
                          <Pencil data-icon="inline-start" /> Editar
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Eliminar ${t.marca} ${t.genero}`} onClick={() => setABorrar(t)}>
                          <Trash2 />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editando && (
        <EditorTabla
          borrador={editando}
          marcas={marcas}
          alCerrar={() => setEditando(null)}
          alGuardar={(texto) => {
            setEditando(null);
            setMensaje({ ok: true, texto });
            router.refresh();
          }}
        />
      )}
      {importando && (
        <ImportarExcel
          alCerrar={() => setImportando(false)}
          alTerminar={(texto) => {
            setImportando(false);
            setMensaje({ ok: true, texto });
            router.refresh();
          }}
        />
      )}
      {aBorrar && (
        <Dialog open onOpenChange={(o) => !o && setABorrar(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>
                Eliminar {aBorrar.marca} · {aBorrar.genero}
              </DialogTitle>
              <DialogDescription>Los catálogos de esta marca y género volverán a salir con talla USA hasta que la agregues otra vez.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setABorrar(null)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  const r = await eliminarTablaTallas(aBorrar.marca, aBorrar.genero);
                  setABorrar(null);
                  setMensaje({ ok: r.success, texto: r.success ? `Eliminada la equivalencia de ${aBorrar.marca} · ${aBorrar.genero}` : r.msg });
                  router.refresh();
                }}
              >
                Eliminar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      <p className="text-xs text-muted-foreground">
        ¿Qué tallas se convierten? Solo las de calzado (8, 10.5, 1Y…). La ropa y los accesorios no llevan equivalencia.{" "}
        <Link href="/admin/marketing/catalogos" className="underline underline-offset-2">
          Ir a los catálogos
        </Link>
      </p>
    </div>
  );
}

// ---------- editor de la tabla de una marca y género ----------
function EditorTabla({ borrador, marcas, alCerrar, alGuardar }: { borrador: Borrador; marcas: string[]; alCerrar: () => void; alGuardar: (texto: string) => void }) {
  const [b, setB] = useState(borrador);
  const [pegando, setPegando] = useState(false);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, guardar] = useTransition();

  const cambiar = (i: number, campo: keyof FilaForm, valor: string) => setB((x) => ({ ...x, filas: x.filas.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)) }));

  function enviar() {
    setError(null);
    guardar(async () => {
      const r = await guardarTablaTallas({ marca: b.marca, genero: b.genero, original: b.original, filas: b.filas.filter((f) => f.peru.trim() || f.usa.trim() || f.pie.trim()).map((f) => ({ peru: f.peru, usa: f.usa, pie_cm: f.pie })) });
      if (r.success) alGuardar(r.msg);
      else setError(r.msg);
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !guardando && alCerrar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{b.original ? `Editar ${b.original.marca} · ${b.original.genero}` : "Nueva equivalencia de tallas"}</DialogTitle>
          <DialogDescription>Una fila por talla USA. Al guardar, esta tabla reemplaza a la que hubiera de esa marca y género.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Marca
            <Input list="marcas-tallas" value={b.marca} onChange={(e) => setB({ ...b, marca: e.target.value.toUpperCase() })} placeholder="ADIDAS" maxLength={40} disabled={guardando} />
            <datalist id="marcas-tallas">
              {marcas.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Género
            <select className={SELECT} value={b.genero} onChange={(e) => setB({ ...b, genero: e.target.value })} disabled={guardando}>
              {GENEROS_TALLAS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <div className="mb-1 grid grid-cols-[1fr_1fr_1fr_2rem] gap-2 px-0.5 text-xs font-medium text-muted-foreground">
            <span>Perú</span>
            <span>USA</span>
            <span>Pie (cm) · opcional</span>
            <span />
          </div>
          <ul className="max-h-[42vh] space-y-1.5 overflow-y-auto pr-1">
            {b.filas.map((f, i) => (
              <li key={i} className="grid grid-cols-[1fr_1fr_1fr_2rem] items-center gap-2">
                <Input inputMode="decimal" value={f.peru} onChange={(e) => cambiar(i, "peru", e.target.value)} placeholder="41.5" aria-label={`Talla peruana, fila ${i + 1}`} disabled={guardando} />
                <Input value={f.usa} onChange={(e) => cambiar(i, "usa", e.target.value)} placeholder="8" aria-label={`Talla USA, fila ${i + 1}`} disabled={guardando} />
                <Input inputMode="decimal" value={f.pie} onChange={(e) => cambiar(i, "pie", e.target.value)} placeholder="26" aria-label={`Pie en cm, fila ${i + 1}`} disabled={guardando} />
                <Button variant="ghost" size="icon-sm" aria-label={`Quitar la fila ${i + 1}`} onClick={() => setB((x) => ({ ...x, filas: x.filas.filter((_, j) => j !== i) }))} disabled={guardando}>
                  <X />
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setB((x) => ({ ...x, filas: [...x.filas, vacia()] }))} disabled={guardando}>
              <Plus data-icon="inline-start" /> Agregar talla
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPegando((p) => !p)} disabled={guardando}>
              Pegar desde Excel
            </Button>
          </div>
          {pegando && (
            <div className="mt-2 space-y-2 rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Copia en Excel las columnas PERU, USA y PIE (sin encabezados) y pégalas aquí. Reemplazan las filas de arriba.</p>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={5}
                className="w-full rounded-lg border border-input bg-transparent p-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder={"40\t7\t24.6\n40.5\t7.5\t25.5"}
                aria-label="Filas pegadas desde Excel"
              />
              <Button
                size="sm"
                onClick={() => {
                  const f = filasPegadas(texto);
                  if (f.length > 0) setB((x) => ({ ...x, filas: f }));
                  setPegando(false);
                  setTexto("");
                }}
                disabled={texto.trim() === ""}
              >
                Usar estas filas
              </Button>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={alCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={guardando || b.marca.trim() === ""}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- importar un Excel ----------
function ImportarExcel({ alCerrar, alTerminar }: { alCerrar: () => void; alTerminar: (texto: string) => void }) {
  const [filas, setFilas] = useState<FilaEntrada[] | null>(null);
  const [vista, setVista] = useState<{ tablas: VistaTabla[]; errores: ErrorFila[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [aplicando, aplicar] = useTransition();

  async function elegir(archivo: File) {
    setError(null);
    setVista(null);
    setFilas(null);
    setLeyendo(true);
    try {
      const f = await leerArchivoTallas(archivo);
      const r = await vistaPreviaTallas(f);
      if (!r.success || !r.data) throw new Error(r.msg);
      setFilas(f);
      setVista(r.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo");
    } finally {
      setLeyendo(false);
    }
  }

  const importar = () =>
    aplicar(async () => {
      const r = await aplicarImportacionTallas(filas ?? []);
      if (r.success && r.data) alTerminar(`${r.msg}: ${r.data.filas.toLocaleString("en-US")} tallas${r.data.omitidas > 0 ? ` (${r.data.omitidas} filas con problemas no entraron)` : ""}`);
      else setError(r.msg);
    });

  return (
    <Dialog open onOpenChange={(o) => !o && !aplicando && alCerrar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Subir equivalencias desde Excel</DialogTitle>
          <DialogDescription>
            La tabla de cada marca y género que venga en el archivo reemplaza a la existente; lo que no venga no se toca. Antes de importar verás qué cambia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Input
            type="file"
            accept=".xlsx,.xls,.csv"
            disabled={leyendo || aplicando}
            aria-label="Archivo de equivalencias"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void elegir(f);
            }}
          />
          <a href="/api/marketing/tallas/plantilla" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Descargar la plantilla vacía
          </a>
          {leyendo && <p className="text-xs text-muted-foreground">Leyendo el archivo…</p>}
        </div>

        {vista && (
          <div className="space-y-3">
            <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
              {vista.tablas.map((t) => (
                <li key={`${t.marca}|${t.genero}`} className="flex items-center justify-between gap-3 px-3 py-1.5">
                  <span>
                    <span className="font-medium">{t.marca}</span> · {t.genero}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t.filas} tallas ·{" "}
                    <span className={cn("rounded-full px-1.5 py-0.5", t.accion === "nueva" ? "bg-green-500/15 text-green-700 dark:text-green-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-400")}>
                      {t.accion === "nueva" ? "nueva" : `reemplaza (${t.filasAntes} → ${t.filas})`}
                    </span>
                  </span>
                </li>
              ))}
              {vista.tablas.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">Ninguna fila válida.</li>}
            </ul>
            {vista.errores.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-destructive">{vista.errores.length} fila{vista.errores.length === 1 ? "" : "s"} con problemas (no se importarán)</p>
                <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs text-destructive">
                  {vista.errores.map((e) => (
                    <li key={e.fila}>
                      Fila {e.fila}: {e.mensaje}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={alCerrar} disabled={aplicando}>
            Cancelar
          </Button>
          <Button onClick={importar} disabled={aplicando || !vista || vista.tablas.length === 0}>
            {aplicando ? "Importando…" : vista && vista.tablas.length > 0 ? `Importar ${vista.tablas.length} tabla${vista.tablas.length === 1 ? "" : "s"}` : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
