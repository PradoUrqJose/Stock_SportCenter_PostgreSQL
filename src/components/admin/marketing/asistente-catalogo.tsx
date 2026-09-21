"use client";

// Asistente para crear un catálogo, por pasos y con transiciones:
//   1. Filtros    — tipo de catálogo, filtros, precio y almacenes
//   2. Plantillas — solo lo que corresponde a los filtros: plantilla de cada marca, portada, separadores, cierres; Preview del documento
//   3. Final      — título, posición de la zapatilla en la plantilla y generar
// El estado vive aquí; cada paso es una vista. El cambio de paso usa la API de View Transitions del
// navegador (si no existe o el usuario pide menos movimiento, cambia sin animación).
import { useCallback, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { Check, ChevronRight, Plus, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { marcasAfectadas, type MarcaAfectada } from "@/lib/actions/marketing-disenos";
import { ALMACENES, ALMACENES_POR_DEFECTO, type FijaBiblioteca, type PlantillaLista, type TipoCatalogo } from "@/lib/marketing-catalogo";
import { cn } from "@/lib/utils";
import { documentoDelCatalogo, ordenConPortada, ordenConSeparador, ordenConSeparadorDeMarca } from "./documento-catalogo";
import { PasoPlantillas } from "./paso-plantillas";
import { PasoFinal } from "./paso-final";
import { crearTipo } from "@/lib/actions/marketing-tipos";
import { DialogoTipo, aEntradaTipo, tipoDesdeBorrador } from "./dialogo-tipo";
import { GuardarComoTipo } from "./guardar-tipo";

export type Opciones = { marcas: string[]; grupos: string[]; generos: string[]; categorias: string[]; tallas: string[] };
export type Recursos = {
  base: string;
  plantillas: PlantillaLista[];
  fijas: (FijaBiblioteca & { activa: boolean })[];
  /** Zapatilla de ejemplo para acomodar su posición en la plantilla. */
  ejemplo: { cod: string; v: number } | null;
  /** Tipos de catálogo activos (de fábrica y personalizados). */
  tipos: TipoCatalogo[];
  /** Familia de la tipografía del diseño (Montserrat Black), para el editor de posiciones del texto. */
  fuente: string;
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
  /** Tallas (escala USA): entra el producto con stock en alguna; vacío = todas. */
  tallas: string[];
  precioMin: string;
  precioMax: string;
  almacenes: string[];
  /** Plantilla elegida por marca (marca → id). */
  plantillas: Record<string, string>;
  /** Portada elegida (id); null = sin portada; undefined = la del tipo (o pendiente con filtros personalizados). */
  portada: string | null | undefined;
  /** Separadores elegidos (ids). */
  separadores: string[];
  /** Orden del documento fijado en el Preview (ids de fijas y «productos»); undefined = automático. */
  orden: string[] | undefined;
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
    tallas: [],
    precioMin: "",
    precioMax: "",
    almacenes: ALMACENES_POR_DEFECTO,
    plantillas: {},
    portada: undefined,
    separadores: [],
    orden: undefined,
  });
  const [marcasCatalogo, setMarcasCatalogo] = useState<MarcaAfectada[] | null>(null);
  // Tipos disponibles: los de la base de datos más los que se guarden desde este asistente.
  const [tipos, setTipos] = useState<TipoCatalogo[]>(recursos.tipos);
  // «＋ Nuevo tipo»: formulario completo para crear un tipo sin salir del asistente.
  const [creandoTipo, setCreandoTipo] = useState(false);

  const cambiar = useCallback((parte: Partial<DatosCatalogo>) => setDatos((d) => ({ ...d, ...parte })), []);

  const sinFiltro = datos.grupos.length + datos.marcas.length + datos.generos.length + datos.categorias.length === 0;
  const puedeAvanzar = !sinFiltro && datos.almacenes.length > 0;
  // ¿Los filtros de ahora son exactamente los del tipo elegido? Si difieren en algo (por ejemplo, se agregó una marca o
  // una talla a «Hombres»), se ofrece guardarlos como un tipo nuevo.
  const tipoElegido = tipos.find((t) => t.id === datos.tipo);
  const mismo = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const numDe = (v: string) => (v.trim() === "" ? null : Number(v));
  const coincideConTipo =
    tipoElegido !== undefined &&
    mismo(datos.categorias, tipoElegido.categorias) &&
    mismo(datos.grupos, tipoElegido.grupos) &&
    mismo(datos.generos, tipoElegido.generos) &&
    mismo(datos.marcas, tipoElegido.marcas) &&
    mismo(datos.tallas, tipoElegido.tallas) &&
    numDe(datos.precioMin) === tipoElegido.precio_min &&
    numDe(datos.precioMax) === tipoElegido.precio_max;
  // Nombre que se sugiere para un tipo nuevo: marca, género, grupo y talla de los filtros; nunca igual a uno que ya existe.
  const partes = [datos.marcas[0], datos.generos.length === 1 ? datos.generos[0] : "", datos.grupos.length === 1 ? datos.grupos[0] : ""]
    .filter(Boolean)
    .map((x) => x.charAt(0) + x.slice(1).toLowerCase())
    .join(" ");
  const conTalla = datos.tallas.length > 0 && datos.tallas.length <= 3 ? `${partes} talla ${datos.tallas.join("/")}`.trim() : partes;
  const candidato = conTalla || (tipoElegido ? tipoElegido.nombre : "");
  const nombreSugerido = candidato && tipos.some((t) => t.nombre.toLowerCase() === candidato.toLowerCase()) ? `${candidato} personalizado` : candidato;

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
    const t = tipos.find((x) => x.id === id);
    if (!t) return;
    const sugerido = `${t.nombre} — ${mesYAnio()}`;
    cambiar({
      tipo: id,
      portada: undefined,
      separadores: [],
      orden: undefined,
      categorias: [...t.categorias],
      grupos: [...t.grupos],
      generos: [...t.generos],
      // Marcas, tallas y precio los llena solo si el tipo los define; si no, se conserva lo que ya estaba elegido.
      ...(t.marcas.length > 0 ? { marcas: [...t.marcas] } : {}),
      ...(t.tallas.length > 0 ? { tallas: [...t.tallas] } : {}),
      ...(t.precio_min != null ? { precioMin: String(t.precio_min) } : {}),
      ...(t.precio_max != null ? { precioMax: String(t.precio_max) } : {}),
      // El título se sugiere mientras no se haya escrito uno propio.
      ...(datos.titulo.trim() === "" || datos.titulo === datos.tituloSugerido ? { titulo: sugerido, tituloSugerido: sugerido } : {}),
    });
  }
  // Un tipo recién guardado se agrega a la lista y queda elegido con los mismos filtros. Desde el paso Plantillas
  // (`conservar`) no se toca la portada ni los separadores que ya se hayan elegido.
  function usarTipoGuardado(t: TipoCatalogo, conservar = false) {
    setTipos((ts) => [...ts, t]);
    const sugerido = `${t.nombre} — ${mesYAnio()}`;
    cambiar({
      tipo: t.id,
      ...(conservar ? {} : { portada: undefined, separadores: [], orden: undefined }),
      ...(datos.titulo.trim() === "" || datos.titulo === datos.tituloSugerido ? { titulo: sugerido, tituloSugerido: sugerido } : {}),
    });
  }
  // Cambiar a mano lo que define el tipo lo vuelve un catálogo «a mano».
  const editar = (campo: "categorias" | "grupos" | "generos") => (v: string[]) => cambiar({ tipo: "", portada: undefined, separadores: [], orden: undefined, [campo]: v });
  const alternarAlmacen = (a: string, on: boolean) => cambiar({ almacenes: on ? [...datos.almacenes, a] : datos.almacenes.filter((x) => x !== a) });

  const indice = PASOS.findIndex((p) => p.id === paso);
  // Lo que lleva el documento según los filtros: plantilla de cada marca, portada, separadores y cierres.
  const documento = useMemo(
    () => documentoDelCatalogo(datos, recursos.plantillas, recursos.fijas, marcasCatalogo),
    [datos, recursos.plantillas, recursos.fijas, marcasCatalogo]
  );

  // Portada y separadores se eligen en el paso Plantillas; si Marketing ya ordenó el documento en el Preview, ese
  // orden se ajusta (la portada nueva sustituye a la anterior; el separador entra justo antes de los productos).
  const idsPortadas = useMemo(() => new Set(recursos.fijas.filter((f) => f.tipo === "portada").map((f) => f.id)), [recursos.fijas]);
  const elegirPortada = useCallback(
    (id: string | null) => setDatos((d) => ({ ...d, portada: id, ...(d.orden ? { orden: ordenConPortada(d.orden, idsPortadas, id) } : {}) })),
    [idsPortadas]
  );
  const marcarSeparador = useCallback(
    (id: string, marcado: boolean) =>
      setDatos((d) => ({
        ...d,
        separadores: marcado ? [...d.separadores, id] : d.separadores.filter((x) => x !== id),
        ...(d.orden ? { orden: ordenConSeparador(d.orden, id, marcado) } : {}),
      })),
    []
  );
  // Un orden fijado en el Preview manda: la portada y los separadores pasan a ser los que hay en él.
  const ordenarDocumento = useCallback(
    (orden: string[]) => {
      const fija = (id: string) => recursos.fijas.find((f) => f.id === id);
      const enOrden = orden.map(fija).filter((f): f is NonNullable<ReturnType<typeof fija>> => Boolean(f));
      cambiar({
        orden,
        portada: enOrden.find((f) => f.tipo === "portada")?.id ?? null,
        separadores: enOrden.filter((f) => f.tipo === "separador").map((f) => f.id),
      });
    },
    [cambiar, recursos.fijas]
  );

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
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {tipos.map((t) => (
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
                      <span className="block text-sm font-medium text-foreground">
                        {t.nombre}
                        {!t.base && <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 align-middle text-[10px] font-normal text-muted-foreground">Personalizado</span>}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{t.descripcion || "Tipo personalizado"}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCreandoTipo(true)}
                    className="flex flex-col items-start justify-center rounded-xl border border-dashed border-foreground/40 px-4 py-3 text-left transition-all duration-300 hover:-translate-y-0.5 hover:bg-muted/50"
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Plus className="h-4 w-4" /> Nuevo tipo
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">Crea uno con tus propios filtros y déjalo guardado</span>
                  </button>
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{datos.tipo ? "Los filtros de abajo se llenaron solos y puedes ajustarlos." : "Sin tipo: elige los filtros a mano."}</span>
                  <Link href="/admin/marketing/catalogos/tipos" className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground">
                    <Settings2 className="h-3 w-3" /> Administrar tipos
                  </Link>
                </p>
              </fieldset>

              <fieldset className={cn("space-y-3", ENTRA)} style={entrada(1)}>
                <legend className="mb-1 text-sm font-medium">Filtros</legend>
                <div className="flex flex-wrap gap-2">
                  <MultiSelectFilter label="Categoría" options={opciones.categorias} selected={datos.categorias} onChange={editar("categorias")} />
                  <MultiSelectFilter label="Grupo" options={opciones.grupos} selected={datos.grupos} onChange={editar("grupos")} />
                  <MultiSelectFilter label="Género" options={opciones.generos} selected={datos.generos} onChange={editar("generos")} />
                  <MultiSelectFilter label="Marca" options={opciones.marcas} selected={datos.marcas} onChange={(v) => cambiar({ marcas: v })} />
                  <MultiSelectFilter label="Talla" options={opciones.tallas} selected={datos.tallas} onChange={(v) => cambiar({ tallas: v })} />
                </div>
                <div className="space-y-2">
                  <Chips valores={datos.categorias} alQuitar={(v) => editar("categorias")(datos.categorias.filter((x) => x !== v))} />
                  <Chips valores={datos.grupos} alQuitar={(v) => editar("grupos")(datos.grupos.filter((x) => x !== v))} />
                  <Chips valores={datos.generos} alQuitar={(v) => editar("generos")(datos.generos.filter((x) => x !== v))} />
                  <Chips valores={datos.marcas} alQuitar={(v) => cambiar({ marcas: datos.marcas.filter((x) => x !== v) })} />
                  <Chips valores={datos.tallas.map((t) => `Talla ${t}`)} alQuitar={(v) => cambiar({ tallas: datos.tallas.filter((x) => `Talla ${x}` !== v) })} />
                </div>
                {datos.tallas.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Entran los productos con stock en alguna de las tallas elegidas; cada página muestra todas las tallas que el producto tiene.
                    {sinFiltro && " Con solo la talla se traería todo el ERP: agrega también un tipo, grupo, género, categoría o marca."}
                  </p>
                )}
                {sinFiltro && <p className="text-xs text-muted-foreground">Elige un tipo o al menos un filtro; sin ninguno se traería todo el ERP.</p>}
                {!sinFiltro && !coincideConTipo && (
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <GuardarComoTipo
                      filtros={datos}
                      nombreSugerido={nombreSugerido}
                      alGuardar={(t) => usarTipoGuardado(t)}
                    />
                    <span className="text-xs text-muted-foreground">Guarda estos filtros para volver a usarlos con un clic.</span>
                  </div>
                )}
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
          <PasoPlantillas
            recursos={recursos}
            datos={datos}
            cambiar={cambiar}
            marcasCatalogo={marcasCatalogo}
            documento={documento}
            nombreSugerido={nombreSugerido}
            alGuardarTipo={(t) => usarTipoGuardado(t, true)}
            alElegirPortada={elegirPortada}
            alMarcarSeparador={marcarSeparador}
            alOrdenar={ordenarDocumento}
            alRestablecerOrden={() => cambiar({ orden: undefined })}
            alSubirSeparadorDeMarca={(marca, id) => setDatos((d) => (d.orden ? { ...d, orden: ordenConSeparadorDeMarca(d.orden, marca, id) } : d))}
            alVolver={() => ir("filtros")}
            alAvanzar={() => ir("final")}
          />
        )}

        {creandoTipo && (
          <DialogoTipo
            titulo="Nuevo tipo de catálogo"
            // Parte de los filtros que ya elegiste; se pueden cambiar en el formulario.
            inicial={{ nombre: nombreSugerido, descripcion: "", categorias: datos.categorias, grupos: datos.grupos, generos: datos.generos, marcas: datos.marcas, tallas: datos.tallas, precioMin: datos.precioMin, precioMax: datos.precioMax }}
            opciones={opciones}
            alGuardar={async (b) => {
              const r = await crearTipo(aEntradaTipo(b));
              if (r.success && r.data) {
                const t = tipoDesdeBorrador(r.data.id, b);
                usarTipoGuardado(t);
                // El tipo nuevo manda: los filtros del asistente quedan como él los definió.
                cambiar({ categorias: t.categorias, grupos: t.grupos, generos: t.generos, marcas: t.marcas, tallas: t.tallas, precioMin: b.precioMin, precioMax: b.precioMax });
              }
              return r;
            }}
            alCerrar={() => setCreandoTipo(false)}
          />
        )}

        {paso === "final" && <PasoFinal recursos={recursos} datos={datos} cambiar={cambiar} documento={documento} alVolver={() => ir("plantillas")} />}
      </div>
    </div>
  );
}
