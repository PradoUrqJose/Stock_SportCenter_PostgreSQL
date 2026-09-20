"use client";

// Paso 2 del asistente: qué plantilla usa cada marca y la biblioteca de diseños (plantillas de zapatilla,
// portadas, separadores, cierres): se ven en grande con un clic y se suben, activan o desactivan aquí.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, Eye, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { activarDiseno, marcarPredeterminada, type MarcaAfectada } from "@/lib/actions/marketing-disenos";
import { MARCA_GENERICA, type FijaBiblioteca } from "@/lib/marketing-catalogo";
import { enviarDiseno, prepararPaginaFija } from "@/lib/subir-imagen-cliente";
import { cn } from "@/lib/utils";
import type { DatosCatalogo, Recursos } from "./asistente-catalogo";
import { PreviewPlantillas } from "./preview-plantillas";

const SELECT =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";
const TIPOS_FIJA: { tipo: FijaBiblioteca["tipo"]; titulo: string; plural: string }[] = [
  { tipo: "portada", titulo: "Portada", plural: "Portadas" },
  { tipo: "separador", titulo: "Separador", plural: "Separadores" },
  { tipo: "cierre", titulo: "Cierre", plural: "Cierres" },
  { tipo: "otra", titulo: "Otra", plural: "Otras" },
];
const etiquetaMarca = (m: string) => (m === MARCA_GENERICA ? "Genérica (sin marca)" : m);

type Subida = { clase: "plantilla"; marca: string } | { clase: "fija"; tipo: FijaBiblioteca["tipo"] };

export function PasoPlantillas({
  recursos,
  datos,
  cambiar,
  marcasCatalogo,
  alVolver,
  alAvanzar,
}: {
  recursos: Recursos;
  datos: DatosCatalogo;
  cambiar: (parte: Partial<DatosCatalogo>) => void;
  marcasCatalogo: MarcaAfectada[] | null;
  alVolver: () => void;
  alAvanzar: () => void;
}) {
  const router = useRouter();
  const [, iniciar] = useTransition();
  const { base, plantillas, fijas } = recursos;
  const [grande, setGrande] = useState<{ src: string; titulo: string } | null>(null);
  const [preview, setPreview] = useState(false);
  const [subida, setSubida] = useState<Subida | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const activas = plantillas.filter((p) => p.activa);
  const propias = (m: string) => activas.filter((p) => p.marca === m);
  const hayGenerica = propias(MARCA_GENERICA).length > 0;
  const elegida = (m: string) => {
    const l = propias(m);
    return (l.find((p) => p.id === datos.plantillas[m]) ?? l.find((p) => p.predeterminada) ?? l[0])?.id ?? "";
  };
  const sinPlantilla = (marcasCatalogo ?? []).filter((m) => propias(m.marca).length === 0);
  const productosSinPlantilla = sinPlantilla.reduce((a, m) => a + m.productos, 0);

  function accion(f: () => Promise<{ success: boolean; msg: string }>) {
    setAviso(null);
    iniciar(async () => {
      const r = await f();
      if (!r.success) setAviso(r.msg);
      router.refresh();
    });
  }

  const marcasConPlantilla = [...new Set(plantillas.map((p) => p.marca))];

  return (
    <section>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Plantillas</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Cada marca usa su plantilla predeterminada; puedes elegir otra. Las marcas sin plantilla usan la genérica. Toca un diseño para verlo en grande.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={alVolver}>
            <ChevronLeft data-icon="inline-start" /> Filtros
          </Button>
          <Button variant="outline" onClick={() => setPreview(true)} disabled={activas.length === 0}>
            <Eye data-icon="inline-start" /> Preview
          </Button>
          <Button onClick={alAvanzar}>
            Avanzar <ChevronRight data-icon="inline-end" />
          </Button>
        </div>
      </header>

      {aviso && <p className="mb-4 text-sm text-destructive">{aviso}</p>}

      {/* Marcas de este catálogo */}
      <div className="mb-8 rounded-xl border border-border p-4 animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500">
        <h3 className="text-sm font-medium text-foreground">Marcas de este catálogo</h3>
        {marcasCatalogo === null ? (
          <p className="mt-2 text-sm text-muted-foreground">Buscando las marcas…</p>
        ) : marcasCatalogo.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No se encontraron productos con stock para estos filtros en el sistema; igual se consultará el ERP al generar.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {marcasCatalogo.map((m, i) => {
              const lista = propias(m.marca);
              return (
                <li key={m.marca} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2 animate-in fade-in slide-in-from-left-2 fill-mode-both duration-500" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                  <span className="w-32 shrink-0 text-sm font-medium text-foreground">{m.marca}</span>
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{m.productos.toLocaleString("en-US")} productos</span>
                  {lista.length > 0 ? (
                    <select
                      className={cn(SELECT, "max-w-xs")}
                      value={elegida(m.marca)}
                      onChange={(e) => cambiar({ plantillas: { ...datos.plantillas, [m.marca]: e.target.value } })}
                      aria-label={`Plantilla de ${m.marca}`}
                    >
                      {lista.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                          {p.predeterminada ? " (predeterminada)" : ""}
                        </option>
                      ))}
                    </select>
                  ) : hayGenerica ? (
                    <span className="text-xs text-muted-foreground">Usa la plantilla genérica</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" /> Sin plantilla: estos productos no entrarán
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {marcasCatalogo !== null && sinPlantilla.length > 0 && !hayGenerica && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              {productosSinPlantilla.toLocaleString("en-US")} productos de {sinPlantilla.length} marca(s) no tienen plantilla ({sinPlantilla.slice(0, 4).map((m) => m.marca).join(", ")}
              {sinPlantilla.length > 4 ? "…" : ""}). Sube una plantilla genérica (sin marca) para que también entren.
            </span>
            <Button size="sm" onClick={() => setSubida({ clase: "plantilla", marca: MARCA_GENERICA })}>
              <Upload data-icon="inline-start" /> Subir genérica
            </Button>
          </div>
        )}
      </div>

      {/* Plantillas de zapatilla, por marca */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">Plantillas de zapatilla</h3>
        <Button size="sm" variant="outline" onClick={() => setSubida({ clase: "plantilla", marca: marcasConPlantilla.find((m) => m !== MARCA_GENERICA) ?? MARCA_GENERICA })}>
          <Upload data-icon="inline-start" /> Subir plantilla
        </Button>
      </div>
      <div className="mb-8 space-y-5">
        {marcasConPlantilla.map((m) => (
          <div key={m}>
            <h4 className="mb-2 text-xs font-medium text-muted-foreground">{etiquetaMarca(m)}</h4>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {plantillas
                .filter((p) => p.marca === m)
                .map((p, i) => (
                  <li key={p.id} className={cn("animate-in fade-in zoom-in-95 fill-mode-both duration-500", !p.activa && "opacity-55")} style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}>
                    <Tarjeta
                      src={`${base}/${p.fondo}.webp`}
                      nombre={p.nombre}
                      insignias={[p.predeterminada && "Predeterminada", !p.activa && "Inactiva"]}
                      alAbrir={() => setGrande({ src: `${base}/${p.fondo}.webp`, titulo: `${etiquetaMarca(p.marca)} · ${p.nombre}` })}
                    >
                      {p.activa && !p.predeterminada && (
                        <Mini onClick={() => accion(() => marcarPredeterminada(p.id))}>Predeterminada</Mini>
                      )}
                      <Mini onClick={() => accion(() => activarDiseno("plantilla", p.id, !p.activa))}>{p.activa ? "Desactivar" : "Activar"}</Mini>
                    </Tarjeta>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Páginas fijas */}
      {TIPOS_FIJA.map(({ tipo, plural }) => {
        const lista = fijas.filter((f) => f.tipo === tipo);
        return (
          <div key={tipo} className="mb-8">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">{plural}</h3>
              <Button size="sm" variant="outline" onClick={() => setSubida({ clase: "fija", tipo })}>
                <Upload data-icon="inline-start" /> Subir
              </Button>
            </div>
            {lista.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">Todavía no hay ninguna.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {lista.map((f, i) => (
                  <li key={f.id} className={cn("animate-in fade-in zoom-in-95 fill-mode-both duration-500", !f.activa && "opacity-55")} style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}>
                    <Tarjeta
                      src={`${base}/${f.imagen}-min.webp`}
                      nombre={f.nombre}
                      insignias={[f.auto_posicion && (f.auto_tipo === "*" ? `Automática (${f.auto_posicion})` : "Automática"), !f.activa && "Inactiva"]}
                      alAbrir={() => setGrande({ src: `${base}/${f.imagen}.webp`, titulo: f.nombre })}
                    >
                      <Mini onClick={() => accion(() => activarDiseno("fija", f.id, !f.activa))}>{f.activa ? "Desactivar" : "Activar"}</Mini>
                    </Tarjeta>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {/* Ver en grande */}
      <Dialog open={grande !== null} onOpenChange={(o) => !o && setGrande(null)}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{grande?.titulo}</DialogTitle>
            <DialogDescription className="sr-only">Vista ampliada del diseño</DialogDescription>
          </DialogHeader>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {grande && <img src={grande.src} alt={grande.titulo} className="w-full rounded-md border border-border" />}
        </DialogContent>
      </Dialog>

      {subida && (
        <DialogoSubir
          subida={subida}
          marcas={recursos.opciones.marcas}
          alCerrar={() => setSubida(null)}
          alTerminar={() => {
            setSubida(null);
            router.refresh();
          }}
        />
      )}

      {preview && <PreviewPlantillas base={base} plantillas={activas} alCerrar={() => setPreview(false)} alSiguiente={() => { setPreview(false); alAvanzar(); }} />}
    </section>
  );
}

function Tarjeta({
  src,
  nombre,
  insignias,
  alAbrir,
  children,
}: {
  src: string;
  nombre: string;
  insignias: (string | false | null)[];
  alAbrir: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="group overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
      <button type="button" onClick={alAbrir} className="block w-full overflow-hidden" aria-label={`Ver ${nombre} en grande`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" loading="lazy" decoding="async" className="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
      </button>
      <div className="space-y-1.5 px-2.5 py-2">
        <p className="truncate text-xs font-medium text-foreground" title={nombre}>
          {nombre}
        </p>
        <div className="flex flex-wrap gap-1">
          {insignias.filter((x): x is string => Boolean(x)).map((t) => (
            <span key={t} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
        {children && <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5">{children}</div>}
      </div>
    </div>
  );
}

function Mini({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline">
      {children}
    </button>
  );
}

function DialogoSubir({ subida, marcas, alCerrar, alTerminar }: { subida: Subida; marcas: string[]; alCerrar: () => void; alTerminar: () => void }) {
  const [nombre, setNombre] = useState("");
  const [marca, setMarca] = useState(subida.clase === "plantilla" ? subida.marca : "");
  const [tipo, setTipo] = useState(subida.clase === "fija" ? subida.tipo : "portada");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!archivo) return;
    setError(null);
    setSubiendo(true);
    try {
      const blob = await prepararPaginaFija(archivo);
      const r =
        subida.clase === "plantilla"
          ? await enviarDiseno(blob, { clase: "plantilla", marca, nombre })
          : await enviarDiseno(blob, { clase: "fija", tipo, nombre });
      if (!r.ok) setError(r.error);
      else alTerminar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo procesar la imagen");
    } finally {
      setSubiendo(false);
    }
  }

  const esPlantilla = subida.clase === "plantilla";
  return (
    <Dialog open onOpenChange={(o) => !o && !subiendo && alCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{esPlantilla ? "Subir plantilla de zapatilla" : "Subir página"}</DialogTitle>
          <DialogDescription>
            {esPlantilla
              ? "Diseño 16:9 vacío, sin zapatilla. Copia las zonas de código, tallas y precio de la plantilla de la marca; la zapatilla se acomoda en el último paso."
              : "Imagen 16:9 de una página completa (portada, separador, términos…). JPG, PNG o WebP de hasta 4 MB después de reducirla."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nombre-diseno">Nombre</Label>
            <Input id="nombre-diseno" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={esPlantilla ? "Nike Navidad" : "Portada Ropa Hombre"} maxLength={60} disabled={subiendo} />
          </div>
          {esPlantilla ? (
            <div className="space-y-1.5">
              <Label htmlFor="marca-diseno">Marca</Label>
              <select id="marca-diseno" className={SELECT} value={marca} onChange={(e) => setMarca(e.target.value)} disabled={subiendo}>
                <option value={MARCA_GENERICA}>Genérica (sin marca)</option>
                {marcas.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="tipo-diseno">Tipo</Label>
              <select id="tipo-diseno" className={SELECT} value={tipo} onChange={(e) => setTipo(e.target.value as FijaBiblioteca["tipo"])} disabled={subiendo}>
                {TIPOS_FIJA.map((t) => (
                  <option key={t.tipo} value={t.tipo}>
                    {t.titulo}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="archivo-diseno">Imagen</Label>
            <Input id="archivo-diseno" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} disabled={subiendo} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={subiendo || !archivo || nombre.trim().length < 2 || (esPlantilla && !marca)}>
            {subiendo ? "Subiendo…" : "Subir"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
