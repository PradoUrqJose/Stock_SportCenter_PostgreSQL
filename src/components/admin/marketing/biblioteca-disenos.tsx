"use client";

// Biblioteca de diseños de Marketing: se ven en grande con un clic, se activan o desactivan, se elige la
// plantilla predeterminada de cada marca y dónde se usa cada página fija. La subida masiva está aquí y en Catálogos.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { activarDiseno, guardarUsoFija, marcarPredeterminada } from "@/lib/actions/marketing-disenos";
import { MARCA_GENERICA, TIPOS_CATALOGO, type FijaBiblioteca, type PlantillaLista } from "@/lib/marketing-catalogo";
import { cn } from "@/lib/utils";
import { AccionMini, TarjetaDiseno } from "./tarjeta-diseno";
import { SubirDisenosMasivo } from "./subir-disenos-masivo";

const SELECT_MINI = "h-6 rounded border border-input bg-transparent px-1 text-[11px] outline-none focus-visible:border-ring";
const TIPOS_FIJA: { tipo: FijaBiblioteca["tipo"]; plural: string }[] = [
  { tipo: "portada", plural: "Portadas" },
  { tipo: "separador", plural: "Separadores" },
  { tipo: "cierre", plural: "Cierres (términos, redes)" },
  { tipo: "otra", plural: "Otras" },
];
const USOS = [{ valor: "", texto: "A mano" }, ...TIPOS_CATALOGO.map((t) => ({ valor: t.id as string, texto: t.nombre as string })), { valor: "*", texto: "Todos" }];
const etiquetaMarca = (m: string) => (m === MARCA_GENERICA ? "Genérica (sin marca)" : m);

function textoUso(f: FijaBiblioteca): string | false {
  if (!f.auto_tipo) return false;
  const tipos = f.auto_tipo.split(",").map((t) => USOS.find((u) => u.valor === t)?.texto ?? t).join(", ");
  return f.auto_posicion ? `${tipos} · ${f.auto_posicion === "inicio" ? "al inicio" : "al final"}` : `${tipos} · sugerida`;
}

export function BibliotecaDisenos({
  base,
  plantillas,
  fijas,
  marcas,
}: {
  base: string;
  plantillas: PlantillaLista[];
  fijas: (FijaBiblioteca & { activa: boolean })[];
  marcas: string[];
}) {
  const router = useRouter();
  const [, iniciar] = useTransition();
  const [grande, setGrande] = useState<{ src: string; titulo: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function accion(f: () => Promise<{ success: boolean; msg: string }>) {
    setAviso(null);
    iniciar(async () => {
      const r = await f();
      if (!r.success) setAviso(r.msg);
      router.refresh();
    });
  }

  const marcasConPlantilla = [...new Set(plantillas.map((p) => p.marca))];
  const hayGenerica = plantillas.some((p) => p.activa && p.marca === MARCA_GENERICA);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Todos los diseños de Marketing. Al crear un catálogo, el asistente usa solo los que corresponden a sus filtros. Toca un diseño para verlo en grande.
        </p>
        <SubirDisenosMasivo marcas={marcas} />
      </div>

      {aviso && <p className="mb-4 text-sm text-destructive">{aviso}</p>}
      {!hayGenerica && (
        <p className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          Falta la plantilla <strong>genérica</strong> (sin marca): sin ella, los productos de marcas sin plantilla propia no entran a los catálogos. Súbela con «Subir diseños» (por ejemplo un archivo llamado <code>PLANTILLA GENERICA</code>).
        </p>
      )}

      <h2 className="mb-3 text-sm font-semibold text-foreground">Plantillas de zapatilla</h2>
      <div className="mb-8 space-y-5">
        {marcasConPlantilla.map((m) => (
          <div key={m}>
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">{etiquetaMarca(m)}</h3>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {plantillas
                .filter((p) => p.marca === m)
                .map((p) => (
                  <li key={p.id} className={cn(!p.activa && "opacity-55")}>
                    <TarjetaDiseno
                      src={`${base}/${p.fondo}.webp`}
                      nombre={p.nombre}
                      insignias={[p.predeterminada && "Predeterminada", !p.activa && "Inactiva"]}
                      alAbrir={() => setGrande({ src: `${base}/${p.fondo}.webp`, titulo: `${etiquetaMarca(p.marca)} · ${p.nombre}` })}
                    >
                      {p.activa && !p.predeterminada && <AccionMini onClick={() => accion(() => marcarPredeterminada(p.id))}>Predeterminada</AccionMini>}
                      <AccionMini onClick={() => accion(() => activarDiseno("plantilla", p.id, !p.activa))}>{p.activa ? "Desactivar" : "Activar"}</AccionMini>
                    </TarjetaDiseno>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>

      {TIPOS_FIJA.map(({ tipo, plural }) => {
        const lista = fijas.filter((f) => f.tipo === tipo);
        if (lista.length === 0) return null;
        return (
          <div key={tipo} className="mb-8">
            <h2 className="mb-3 text-sm font-semibold text-foreground">{plural}</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {lista.map((f) => {
                const tipoUso = (f.auto_tipo ?? "").split(",")[0] ?? "";
                return (
                  <li key={f.id} className={cn(!f.activa && "opacity-55")}>
                    <TarjetaDiseno
                      src={`${base}/${f.imagen}-min.webp`}
                      nombre={f.nombre}
                      insignias={[textoUso(f), !f.activa && "Inactiva"]}
                      alAbrir={() => setGrande({ src: `${base}/${f.imagen}.webp`, titulo: f.nombre })}
                    >
                      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        {f.tipo === "portada" ? "Portada de" : "Se usa en"}
                        <select
                          className={SELECT_MINI}
                          value={tipoUso}
                          onChange={(e) => accion(() => guardarUsoFija(f.id, e.target.value ? [e.target.value] : [], e.target.value ? (f.tipo === "portada" ? "inicio" : (f.auto_posicion ?? "")) : ""))}
                        >
                          {USOS.map((u) => (
                            <option key={u.valor} value={u.valor}>
                              {u.texto}
                            </option>
                          ))}
                        </select>
                      </label>
                      {tipoUso !== "" && f.tipo !== "portada" && (
                        <select
                          className={SELECT_MINI}
                          value={f.auto_posicion ?? ""}
                          onChange={(e) => accion(() => guardarUsoFija(f.id, (f.auto_tipo ?? "").split(",").filter(Boolean), e.target.value as "" | "inicio" | "final"))}
                          aria-label="Posición"
                        >
                          <option value="">Sugerida</option>
                          <option value="inicio">Al inicio</option>
                          <option value="final">Al final</option>
                        </select>
                      )}
                      <AccionMini onClick={() => accion(() => activarDiseno("fija", f.id, !f.activa))}>{f.activa ? "Desactivar" : "Activar"}</AccionMini>
                    </TarjetaDiseno>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

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
    </div>
  );
}
