"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Info,
  LayoutGrid,
  List,
  ImageOff,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReemplazarImagen } from "./reemplazar-imagen";
import { useVistaPendientes } from "./marco-imagenes";
import {
  GaleriaProductosSinImagen,
  TablaProductosSinImagen,
} from "./vistas-productos-sin-imagen";
import {
  iniciarRevisionImagenes,
  consultarEstadoRevisionImagenes,
} from "@/lib/actions/marketing-revision-imagenes";
import {
  filtrarRevisionImagen,
  type FiltrosRevisionImagen,
  type ProductoRevisionImagen,
} from "@/lib/marketing-imagenes-pendientes";
import type { EstadoRevisionImagen } from "@/lib/marketing-revision-imagenes";
import { fechaStock } from "@/lib/marketing-sincronizar";
import { cn } from "@/lib/utils";

const POR_PAGINA = 50;
const INICIALES: FiltrosRevisionImagen = {
  q: "",
  marca: "",
  genero: "",
  categoria: "",
  orden: "stock",
};
const numero = (n: number) => n.toLocaleString("en-US");

function Filtro({
  etiqueta,
  valor,
  opciones,
  cambiar,
}: {
  etiqueta: string;
  valor: string;
  opciones: string[];
  cambiar: (v: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
      {etiqueta}
      <select
        aria-label={etiqueta}
        value={valor}
        onChange={(e) => cambiar(e.target.value)}
        className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm font-normal text-foreground"
      >
        <option value="">Todas las opciones</option>
        {opciones.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ProductosSinImagen({
  pendientes,
  total,
  consultadoAl,
  almacenes,
  consulta,
}: {
  pendientes: ProductoRevisionImagen[];
  total: number;
  consultadoAl: string | null;
  almacenes: string[];
  consulta: EstadoRevisionImagen | null;
}) {
  const router = useRouter();
  const [filtros, setFiltros] = useState(INICIALES);
  const { vista, setVista } = useVistaPendientes();
  const [infoAbierta, setInfoAbierta] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [seleccionado, setSeleccionado] =
    useState<ProductoRevisionImagen | null>(null);
  const [estado, setEstado] = useState(consulta);
  const [iniciando, setIniciando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [subida, setSubida] = useState<string | null>(null);
  const trabajando = iniciando || estado?.estado === "en_curso";

  useEffect(() => {
    if (estado?.estado !== "en_curso") return;
    const id = estado.id;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout>;
    async function comprobar() {
      try {
        const r = await consultarEstadoRevisionImagenes(id);
        if (!vivo) return;
        if (!r.success || !r.data) {
          setAviso(r.msg);
          timer = setTimeout(comprobar, 5000);
          return;
        }
        setAviso(null);
        setEstado(r.data);
        if (r.data.estado === "en_curso") timer = setTimeout(comprobar, 2500);
        else router.refresh();
      } catch {
        if (vivo) {
          setAviso("No se pudo comprobar el avance. Volveremos a intentarlo.");
          timer = setTimeout(comprobar, 5000);
        }
      }
    }
    void comprobar();
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [estado?.id, estado?.estado, router]);

  async function actualizar() {
    setIniciando(true);
    setAviso(null);
    try {
      const r = await iniciarRevisionImagenes();
      if (!r.success || !r.data) setAviso(r.msg);
      else setEstado({ id: r.data.id, estado: "en_curso", mensaje: null });
    } catch {
      setAviso("No se pudo iniciar la consulta. Inténtalo otra vez.");
    } finally {
      setIniciando(false);
    }
  }

  const opciones = useMemo(() => {
    const valores = (campo: "marcas" | "generos" | "categorias") =>
      [...new Set(pendientes.flatMap((p) => p[campo]))].sort();
    return {
      marcas: valores("marcas"),
      generos: valores("generos"),
      categorias: valores("categorias"),
    };
  }, [pendientes]);
  const filtrados = useMemo(
    () => filtrarRevisionImagen(pendientes, filtros),
    [pendientes, filtros],
  );
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas);
  const visibles = filtrados.slice(
    (actual - 1) * POR_PAGINA,
    actual * POR_PAGINA,
  );
  const cambiar = <K extends keyof FiltrosRevisionImagen>(
    k: K,
    v: FiltrosRevisionImagen[K],
  ) => {
    setFiltros((f) => ({ ...f, [k]: v }));
    setPagina(1);
  };
  const hayFiltros =
    filtros.q || filtros.marca || filtros.genero || filtros.categoria;
  const conImagen = total - pendientes.length;
  const porcentaje = total ? Math.round((conImagen * 100) / total) : 0;

  const exportacion = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros))
    if (valor) exportacion.set(clave, valor);
  const urlExcel = `/api/marketing/imagenes/pendientes/exportar?${exportacion}`;
  const seleccionar = (producto: ProductoRevisionImagen) => {
    setSubida(null);
    setSeleccionado(producto);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Pendientes de imagen</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Encuentra los productos con stock que todavía necesitan una imagen.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            aria-label="Información de la consulta"
            onClick={() => setInfoAbierta(true)}
          >
            <Info className="size-4" />
            <span className="hidden sm:inline">Información</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={actualizar}
            disabled={trabajando}
            aria-label="Actualizar desde ERP"
          >
            {trabajando ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {trabajando ? "Consultando…" : "Actualizar ERP"}
          </Button>
        </div>
      </div>

      {consultadoAl && (
        <div
          className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs"
          aria-label="Resumen de imágenes"
        >
          <span className="text-muted-foreground">
            <strong className="mr-1 text-sm font-semibold tabular-nums text-foreground">
              {numero(total)}
            </strong>{" "}
            con stock
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-amber-500" />
            <strong className="text-sm font-semibold tabular-nums">
              {numero(pendientes.length)}
            </strong>
            <span className="text-muted-foreground">sin imagen</span>
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <strong className="text-sm font-semibold tabular-nums text-foreground">
              {numero(conImagen)}
            </strong>{" "}
            con imagen<span className="ml-1 text-[10px]">({porcentaje}%)</span>
          </span>
        </div>
      )}
      {trabajando && (
        <p
          role="status"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Loader2 className="size-3.5 animate-spin" /> Consultando el ERP.
          Puedes salir y volver; la consulta continúa.
        </p>
      )}
      {estado?.estado === "error" && (
        <p role="alert" className="text-xs text-destructive">
          {estado.mensaje}
          {consultadoAl ? " Se mantiene la última consulta completada." : ""}
        </p>
      )}
      {aviso && (
        <p role="alert" className="text-xs text-destructive">
          {aviso}
        </p>
      )}
      {subida && (
        <p
          role="status"
          className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400"
        >
          <Check className="size-3.5" /> Imagen de {subida} guardada.
        </p>
      )}

      {consultadoAl ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="space-y-3 border-b border-border p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                className="flex rounded-lg bg-muted p-0.5"
                role="group"
                aria-label="Vista de productos pendientes"
              >
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Vista tabla"
                  aria-pressed={vista === "tabla"}
                  className={cn(
                    "h-7 gap-1.5 px-2.5 text-xs",
                    vista === "tabla" && "bg-background shadow-xs",
                  )}
                  onClick={() => setVista("tabla")}
                >
                  <List className="size-3.5" /> Tabla
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Vista galería"
                  aria-pressed={vista === "galeria"}
                  className={cn(
                    "h-7 gap-1.5 px-2.5 text-xs",
                    vista === "galeria" && "bg-background shadow-xs",
                  )}
                  onClick={() => setVista("galeria")}
                >
                  <LayoutGrid className="size-3.5" /> Galería
                </Button>
              </div>
              {filtrados.length > 0 ? (
                <a
                  href={urlExcel}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "gap-1.5 text-xs",
                  )}
                >
                  <FileSpreadsheet className="size-3.5" /> Exportar Excel
                </a>
              ) : (
                <Button size="sm" variant="outline" disabled>
                  <FileSpreadsheet /> Exportar Excel
                </Button>
              )}
            </div>
            <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_1fr_1fr_1fr]">
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
                Buscar
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 size-4" />
                  <Input
                    aria-label="Buscar productos sin imagen"
                    value={filtros.q}
                    maxLength={120}
                    onChange={(e) => cambiar("q", e.target.value)}
                    placeholder="Código, marca, modelo o color…"
                    className="h-9 pl-8"
                  />
                </div>
              </label>
              <Filtro
                etiqueta="Marca"
                valor={filtros.marca}
                opciones={opciones.marcas}
                cambiar={(v) => cambiar("marca", v)}
              />
              <Filtro
                etiqueta="Género / edad"
                valor={filtros.genero}
                opciones={opciones.generos}
                cambiar={(v) => cambiar("genero", v)}
              />
              <Filtro
                etiqueta="Categoría"
                valor={filtros.categoria}
                opciones={opciones.categorias}
                cambiar={(v) => cambiar("categoria", v)}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <span aria-live="polite">
                  {numero(filtrados.length)} producto(s)
                  {hayFiltros
                    ? ` de ${numero(pendientes.length)} pendientes`
                    : " pendientes"}
                </span>
                {hayFiltros && (
                  <button
                    className="underline underline-offset-4 hover:text-foreground"
                    onClick={() => {
                      setFiltros(INICIALES);
                      setPagina(1);
                    }}
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
              <label className="flex items-center gap-2">
                Ordenar
                <select
                  aria-label="Ordenar pendientes"
                  value={filtros.orden}
                  onChange={(e) =>
                    cambiar(
                      "orden",
                      e.target.value as FiltrosRevisionImagen["orden"],
                    )
                  }
                  className="rounded-md border border-input bg-background px-2 py-1 text-foreground"
                >
                  <option value="stock">Mayor stock primero</option>
                  <option value="marca">Marca</option>
                  <option value="codigo">Código</option>
                </select>
              </label>
            </div>
          </div>
          {!visibles.length ? (
            <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
              <ImageOff className="size-7 text-muted-foreground" />
              <p className="text-sm font-medium">
                {pendientes.length
                  ? "Ningún producto coincide con esos filtros"
                  : "Todos los productos de esta consulta tienen imagen registrada"}
              </p>
              <p className="text-xs text-muted-foreground">
                {pendientes.length
                  ? "Prueba otra búsqueda o limpia los filtros."
                  : "Puedes actualizar desde el ERP para comprobar productos nuevos."}
              </p>
            </div>
          ) : vista === "tabla" ? (
            <TablaProductosSinImagen
              productos={visibles}
              seleccionar={seleccionar}
            />
          ) : (
            <GaleriaProductosSinImagen
              productos={visibles}
              seleccionar={seleccionar}
            />
          )}
          {visibles.length > 0 && (
            <nav
              aria-label="Paginación de productos sin imagen"
              className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-3 text-xs text-muted-foreground"
            >
              <span>
                {numero((actual - 1) * POR_PAGINA + 1)}–
                {numero(Math.min(actual * POR_PAGINA, filtrados.length))} de{" "}
                {numero(filtrados.length)} · Página {actual} de {paginas}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actual === 1}
                  onClick={() => setPagina(actual - 1)}
                >
                  <ChevronLeft /> Anterior
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actual === paginas}
                  onClick={() => setPagina(actual + 1)}
                >
                  Siguiente <ChevronRight />
                </Button>
              </div>
            </nav>
          )}
        </div>
      ) : (
        !trabajando && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-14 text-center">
            <ImageOff className="size-8 text-muted-foreground" />
            <h3 className="text-sm font-medium">
              Encuentra las imágenes que faltan
            </h3>
            <p className="max-w-md text-xs text-muted-foreground">
              Pulsa «Actualizar ERP» para revisar todos los productos con stock.
            </p>
            <Link
              href="/admin/marketing/imagenes"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              Ver imágenes guardadas
            </Link>
          </div>
        )
      )}

      <Dialog open={infoAbierta} onOpenChange={setInfoAbierta}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Información de la consulta</DialogTitle>
            <DialogDescription>
              Origen y actualización de los productos pendientes.
            </DialogDescription>
          </DialogHeader>
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">
                Stock consultado
              </dt>
              <dd className="mt-1 font-medium">
                {consultadoAl
                  ? `${fechaStock(consultadoAl)} (Lima)`
                  : "Todavía no se ha consultado el ERP"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Almacenes</dt>
              <dd className="mt-1 text-xs leading-relaxed">
                {almacenes.join(", ")}
              </dd>
            </div>
          </dl>
          <div className="space-y-2 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
            <p>
              Buscar, filtrar y exportar utiliza la última consulta guardada.
              Las imágenes registradas se comprueban al abrir o actualizar esta
              pantalla.
            </p>
            <p>
              Una imagen resuelve todas las edades y tallas de un código. Se
              recorta, centra y escala automáticamente al subirla.
            </p>
            <p>
              Las fotos externas del ERP no cuentan como imágenes preparadas.
              Para reflejar una imagen nueva en un catálogo publicado, vuelve a
              publicarlo.
            </p>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!seleccionado}
        onOpenChange={(open) => {
          if (!open) setSeleccionado(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Subir imagen · {seleccionado?.codigo}</DialogTitle>
            <DialogDescription>
              {seleccionado?.marcas.join(" / ")} ·{" "}
              {seleccionado?.modelos.join(" / ")}. La imagen se usa en todas las
              edades y tallas de este código.
            </DialogDescription>
          </DialogHeader>
          {seleccionado && (
            <ReemplazarImagen
              key={seleccionado.codigo}
              codigo={seleccionado.codigo}
              modo="nueva"
              urlActual=""
              onHecho={() => {
                setSubida(seleccionado.codigo);
                setSeleccionado(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
