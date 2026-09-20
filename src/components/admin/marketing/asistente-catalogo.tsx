"use client";

// Asistente para crear un catálogo, por pasos y con transiciones:
//   1. Filtros    — tipo de catálogo, filtros, precio y almacenes
//   2. Plantillas — qué plantilla usa cada marca; subir y ver todos los diseños
//   3. Final      — título, posición de la zapatilla en la plantilla y generar
// El estado vive aquí; cada paso es una vista. El cambio de paso usa la API de View Transitions del
// navegador (si no existe o el usuario pide menos movimiento, cambia sin animación).
import { useCallback, useState } from "react";
import { flushSync } from "react-dom";
import { Check, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { marcasAfectadas, type MarcaAfectada } from "@/lib/actions/marketing-disenos";
import { ALMACENES, ALMACENES_POR_DEFECTO, TIPOS_CATALOGO, type FijaBiblioteca, type PlantillaLista } from "@/lib/marketing-catalogo";
import { cn } from "@/lib/utils";
import { PasoPlantillas } from "./paso-plantillas";
import { PasoFinal } from "./paso-final";

export type Opciones = { marcas: string[]; grupos: string[]; generos: string[]; categorias: string[] };
export type Recursos = {
  base: string;
  plantillas: PlantillaLista[];
  fijas: (FijaBiblioteca & { activa: boolean })[];
  /** Zapatilla de ejemplo para acomodar su posición en la plantilla. */
  ejemplo: { cod: string; v: number } | null;
  opciones: Opciones;
};

export type DatosCatalogo = {
  titulo: string;
  tituloSugerido: string;
  tipo: string;
  categorias: string[];
  grupos: string[];
  generos: string[];
  marcas: string[];
  precioMin: string;
  precioMax: string;
  almacenes: string[];
  /** Plantilla elegida por marca (marca → id). */
  plantillas: Record<string, string>;
};

type Paso = "filtros" | "plantillas" | "final";
const PASOS: { id: Paso; titulo: string }[] = [
  { id: "filtros", titulo: "Filtros" },
  { id: "plantillas", titulo: "Plantillas" },
  { id: "final", titulo: "Título y posición" },
];

/** «Setiembre 2026»: mes y año de hoy para el título sugerido. */
function mesYAnio(): string {
  const f = new Date().toLocaleDateString("es-PE", { month: "long", year: "numeric" }).replace(" de ", " ");
  return f.charAt(0).toUpperCase() + f.slice(1);
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
          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs text-foreground transition-colors hover:bg-muted"
          aria-label={`Quitar ${v}`}
        >
          {v} <X className="h-3 w-3 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}

const entrada = (i: number) => ({ animationDelay: `${i * 60}ms` });
const ENTRA = "animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500";

export function AsistenteCatalogo({ recursos }: { recursos: Recursos }) {
  const { opciones } = recursos;
  const [paso, setPaso] = useState<Paso>("filtros");
  const [datos, setDatos] = useState<DatosCatalogo>({
    titulo: "",
    tituloSugerido: "",
    tipo: "",
    categorias: [],
    grupos: [],
    generos: [],
    marcas: [],
    precioMin: "",
    precioMax: "",
    almacenes: ALMACENES_POR_DEFECTO,
    plantillas: {},
  });
  const [marcasCatalogo, setMarcasCatalogo] = useState<MarcaAfectada[] | null>(null);

  const cambiar = useCallback((parte: Partial<DatosCatalogo>) => setDatos((d) => ({ ...d, ...parte })), []);

  const sinFiltro = datos.grupos.length + datos.marcas.length + datos.generos.length + datos.categorias.length === 0;
  const puedeAvanzar = !sinFiltro && datos.almacenes.length > 0;

  /** Cambia de paso con una transición de deslizamiento (si el navegador y el usuario lo permiten). */
  const ir = useCallback(
    (destino: Paso) => {
      const dir = PASOS.findIndex((p) => p.id === destino) > PASOS.findIndex((p) => p.id === paso) ? "adelante" : "atras";
      const aplicar = () => flushSync(() => setPaso(destino));
      const menosMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.documentElement.dataset.dir = dir;
      if (!menosMovimiento && typeof document.startViewTransition === "function") document.startViewTransition(aplicar);
      else aplicar();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [paso]
  );

  async function irAPlantillas() {
    ir("plantillas");
    setMarcasCatalogo(null);
    const r = await marcasAfectadas({ categorias: datos.categorias, grupos: datos.grupos, generos: datos.generos, marcas: datos.marcas });
    setMarcasCatalogo(r.success && r.data ? r.data : []);
  }

  // Elegir un tipo llena grupo, género y categoría (las marcas y el precio se conservan); después se puede ajustar todo.
  function elegirTipo(id: string) {
    const t = TIPOS_CATALOGO.find((x) => x.id === id);
    if (!t) return;
    const sugerido = `${t.nombre} — ${mesYAnio()}`;
    cambiar({
      tipo: id,
      categorias: [...t.categorias],
      grupos: [...t.grupos],
      generos: [...t.generos],
      // El título se sugiere mientras no se haya escrito uno propio.
      ...(datos.titulo.trim() === "" || datos.titulo === datos.tituloSugerido ? { titulo: sugerido, tituloSugerido: sugerido } : {}),
    });
  }
  // Cambiar a mano lo que define el tipo lo vuelve un catálogo «a mano».
  const editar = (campo: "categorias" | "grupos" | "generos") => (v: string[]) => cambiar({ tipo: "", [campo]: v });
  const alternarAlmacen = (a: string, on: boolean) => cambiar({ almacenes: on ? [...datos.almacenes, a] : datos.almacenes.filter((x) => x !== a) });

  const indice = PASOS.findIndex((p) => p.id === paso);

  return (
    <div className="mx-auto max-w-5xl">
      {/* Pasos */}
      <ol className="mb-8 flex items-center gap-2 sm:gap-3" aria-label="Pasos">
        {PASOS.map((p, i) => {
          const hecho = i < indice;
          const actual = i === indice;
          return (
            <li key={p.id} className="flex flex-1 items-center gap-2 sm:gap-3">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-all duration-500",
                  hecho && "border-green-600 bg-green-600 text-white",
                  actual && "scale-110 border-foreground bg-foreground text-background",
                  !hecho && !actual && "border-border text-muted-foreground"
                )}
                aria-current={actual ? "step" : undefined}
              >
                {hecho ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn("hidden text-sm transition-colors duration-500 sm:block", actual ? "font-medium text-foreground" : "text-muted-foreground")}>{p.titulo}</span>
              {i < PASOS.length - 1 && (
                <span className="relative h-0.5 flex-1 overflow-hidden rounded bg-border">
                  <span className={cn("absolute inset-y-0 left-0 bg-green-600 transition-all duration-700", hecho ? "w-full" : "w-0")} />
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div style={{ viewTransitionName: "paso" }}>
        {paso === "filtros" && (
          <section>
            <header className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Filtros</h2>
                <p className="mt-1 text-sm text-muted-foreground">Elige un tipo de catálogo o los filtros a mano. El ERP trae una página por producto y género.</p>
              </div>
              <Button onClick={() => void irAPlantillas()} disabled={!puedeAvanzar}>
                Avanzar <ChevronRight data-icon="inline-end" />
              </Button>
            </header>

            <div className="space-y-7">
              <fieldset className={ENTRA} style={entrada(0)}>
                <legend className="mb-2 text-sm font-medium">Tipo de catálogo</legend>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {TIPOS_CATALOGO.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={datos.tipo === t.id}
                      onClick={() => elegirTipo(t.id)}
                      className={cn(
                        "rounded-xl border px-4 py-3 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-sm",
                        datos.tipo === t.id ? "border-foreground bg-muted shadow-sm" : "border-border hover:bg-muted/50"
                      )}
                    >
                      <span className="block text-sm font-medium text-foreground">{t.nombre}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{t.descripcion}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {datos.tipo ? "Los filtros de abajo se llenaron solos y puedes ajustarlos." : "Sin tipo: elige los filtros a mano."}
                </p>
              </fieldset>

              <fieldset className={cn("space-y-3", ENTRA)} style={entrada(1)}>
                <legend className="mb-1 text-sm font-medium">Filtros</legend>
                <div className="flex flex-wrap gap-2">
                  <MultiSelectFilter label="Categoría" options={opciones.categorias} selected={datos.categorias} onChange={editar("categorias")} />
                  <MultiSelectFilter label="Grupo" options={opciones.grupos} selected={datos.grupos} onChange={editar("grupos")} />
                  <MultiSelectFilter label="Género" options={opciones.generos} selected={datos.generos} onChange={editar("generos")} />
                  <MultiSelectFilter label="Marca" options={opciones.marcas} selected={datos.marcas} onChange={(v) => cambiar({ marcas: v })} />
                </div>
                <div className="space-y-2">
                  <Chips valores={datos.categorias} alQuitar={(v) => editar("categorias")(datos.categorias.filter((x) => x !== v))} />
                  <Chips valores={datos.grupos} alQuitar={(v) => editar("grupos")(datos.grupos.filter((x) => x !== v))} />
                  <Chips valores={datos.generos} alQuitar={(v) => editar("generos")(datos.generos.filter((x) => x !== v))} />
                  <Chips valores={datos.marcas} alQuitar={(v) => cambiar({ marcas: datos.marcas.filter((x) => x !== v) })} />
                </div>
                {sinFiltro && <p className="text-xs text-muted-foreground">Elige un tipo o al menos un filtro; sin ninguno se traería todo el ERP.</p>}
              </fieldset>

              <fieldset className={cn("space-y-2", ENTRA)} style={entrada(2)}>
                <legend className="mb-1 text-sm font-medium">Precio lista (S/)</legend>
                <div className="flex items-center gap-2">
                  <Input type="number" inputMode="decimal" min={0} value={datos.precioMin} onChange={(e) => cambiar({ precioMin: e.target.value })} placeholder="Desde" className="w-32" aria-label="Precio desde" />
                  <span className="text-sm text-muted-foreground">a</span>
                  <Input type="number" inputMode="decimal" min={0} value={datos.precioMax} onChange={(e) => cambiar({ precioMax: e.target.value })} placeholder="Hasta" className="w-32" aria-label="Precio hasta" />
                </div>
              </fieldset>

              <fieldset className={cn("space-y-2", ENTRA)} style={entrada(3)}>
                <legend className="mb-1 text-sm font-medium">Almacenes</legend>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {ALMACENES.map((a) => (
                    <label key={a} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={datos.almacenes.includes(a)} onCheckedChange={(v) => alternarAlmacen(a, v === true)} />
                      {a}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </section>
        )}

        {paso === "plantillas" && (
          <PasoPlantillas recursos={recursos} datos={datos} cambiar={cambiar} marcasCatalogo={marcasCatalogo} alVolver={() => ir("filtros")} alAvanzar={() => ir("final")} />
        )}

        {paso === "final" && <PasoFinal recursos={recursos} datos={datos} cambiar={cambiar} alVolver={() => ir("plantillas")} />}
      </div>
    </div>
  );
}
