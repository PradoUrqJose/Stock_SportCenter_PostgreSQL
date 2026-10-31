"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ImageOff,
  Loader2,
  RefreshCw,
  Search,
  Upload,
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
import { SubirImagenes } from "./subir-imagenes";
import {
  iniciarRevisionImagenes,
  consultarEstadoRevisionImagenes,
} from "@/lib/actions/marketing-revision-imagenes";
import {
  csvRevisionImagen,
  filtrarRevisionImagen,
  type FiltrosRevisionImagen,
  type ProductoRevisionImagen,
} from "@/lib/marketing-imagenes-pendientes";
import type { EstadoRevisionImagen } from "@/lib/marketing-revision-imagenes";
import { codigoValido } from "@/lib/marketing-codigos";
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

  function exportar() {
    const url = URL.createObjectURL(
      new Blob([csvRevisionImagen(filtrados)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "productos-sin-imagen.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Productos sin imagen</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Todos los productos con stock del ERP, incluidos los que todavía no
            aparecen en un catálogo.
          </p>
        </div>
        <Button onClick={actualizar} disabled={trabajando} variant="outline">
          {trabajando ? <Loader2 className="animate-spin" /> : <RefreshCw />}{" "}
          {trabajando ? "Consultando ERP…" : "Actualizar desde ERP"}
        </Button>
      </div>

      <nav
        className="flex gap-1 border-b border-border"
        aria-label="Vistas de imágenes"
      >
        <Link
          href="/admin/marketing/imagenes"
          className="border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Imágenes guardadas
        </Link>
        <span
          aria-current="page"
          className="border-b-2 border-primary px-3 py-2 text-sm font-medium text-foreground"
        >
          Sin imagen
        </span>
      </nav>

      <div className="rounded-xl border border-border bg-card p-4 text-sm">
        {consultadoAl ? (
          <>
            <p>
              Stock consultado el <strong>{fechaStock(consultadoAl)}</strong>{" "}
              (Lima).
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Almacenes: {almacenes.join(", ")}. Buscar y filtrar usa esta
              consulta guardada. Las imágenes registradas se comprueban al abrir
              o actualizar la pantalla.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">
            Todavía no hay una consulta del ERP. Pulsa «Actualizar desde ERP»
            para encontrar los productos pendientes.
          </p>
        )}
        {trabajando && (
          <p
            role="status"
            className="mt-2 flex items-center gap-2 text-primary"
          >
            <Loader2 className="size-4 shrink-0 animate-spin" /> Consultando
            todos los productos con stock. Puedes salir y volver; la consulta
            continúa.
          </p>
        )}
        {estado?.estado === "error" && (
          <p role="alert" className="mt-2 text-destructive">
            {estado.mensaje}
            {consultadoAl ? " Se mantiene la última consulta completada." : ""}
          </p>
        )}
        {aviso && (
          <p role="alert" className="mt-2 text-destructive">
            {aviso}
          </p>
        )}
        {subida && (
          <p
            role="status"
            className="mt-2 flex items-center gap-2 text-green-700 dark:text-green-400"
          >
            <Check className="size-4" /> Imagen de {subida} guardada.
          </p>
        )}
      </div>

      {consultadoAl && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">
                Productos con stock en ERP
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {numero(total)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Códigos únicos
              </p>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-xs text-muted-foreground">
                Sin imagen registrada
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                {numero(pendientes.length)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Una imagen resuelve todas sus edades y tallas
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">
                Con imagen registrada
              </p>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums">
                  {numero(conImagen)}
                </p>
                <span className="text-sm text-muted-foreground">
                  {porcentaje}%
                </span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${porcentaje}%` }}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="space-y-4 border-b border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">
                    Pendientes de imagen
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sube una imagen transparente; se recorta, centra y escala
                    automáticamente.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={exportar}
                    disabled={!filtrados.length}
                  >
                    <Download /> Exportar CSV
                  </Button>
                  <SubirImagenes />
                </div>
              </div>
              <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_1fr_1fr_1fr]">
                <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
                  Buscar
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 size-4" />
                    <Input
                      aria-label="Buscar productos sin imagen"
                      value={filtros.q}
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
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span aria-live="polite">
                    {numero(filtrados.length)} producto(s)
                    {hayFiltros
                      ? ` de ${numero(pendientes.length)} pendientes`
                      : " pendientes"}
                  </span>
                  {hayFiltros && (
                    <button
                      className="font-medium underline underline-offset-4 hover:text-foreground"
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
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-medium">
                          Producto
                        </th>
                        <th scope="col" className="px-4 py-3 font-medium">
                          Marca
                        </th>
                        <th scope="col" className="px-4 py-3 font-medium">
                          Género / edad
                        </th>
                        <th scope="col" className="px-4 py-3 font-medium">
                          Categoría
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-right font-medium"
                        >
                          Stock ERP
                        </th>
                        <th scope="col" className="px-4 py-3">
                          <span className="sr-only">Acción</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {visibles.map((p) => (
                        <tr key={p.codigo} className="hover:bg-muted/20">
                          <td className="px-4 py-3">
                            <p className="font-mono text-xs font-semibold">
                              {p.codigo}
                            </p>
                            <p className="mt-1 max-w-72 text-xs text-muted-foreground">
                              {p.modelos.join(" / ") || "Sin modelo"}
                            </p>
                            {p.colores.length > 0 && (
                              <p className="mt-0.5 max-w-72 text-[11px] text-muted-foreground">
                                {p.colores.join(" / ")}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {p.marcas.join(" / ") || "Sin marca"}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {p.generos.join(" / ") || "Sin género"}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {p.categorias.join(" / ") || "Sin categoría"}
                          </td>
                          <td className="px-4 py-3 text-right text-xs tabular-nums">
                            {p.stock === null ? (
                              <span
                                title="El ERP repite una ficha de este código y edad; revisa sus cantidades"
                                className="text-amber-700 dark:text-amber-400"
                              >
                                Por revisar
                              </span>
                            ) : (
                              numero(p.stock)
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              aria-label={`Subir imagen de ${p.codigo}`}
                              onClick={() => {
                                setSubida(null);
                                setSeleccionado(p);
                              }}
                              disabled={!codigoValido(p.codigo)}
                            >
                              <Upload /> Subir imagen
                            </Button>
                            {!codigoValido(p.codigo) && (
                              <p className="mt-1 text-xs text-destructive">
                                Revisar código en ERP
                              </p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <nav
                  aria-label="Paginación de productos sin imagen"
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-xs text-muted-foreground"
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
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            La revisión cruza los códigos del ERP con el registro de imágenes de
            Marketing. Las URL externas de fotos del ERP no cuentan como
            imágenes preparadas para el catálogo. Para reflejar una imagen nueva
            en un catálogo publicado, vuelve a publicarlo.
          </p>
        </>
      )}

      {!consultadoAl && !trabajando && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <ImageOff className="size-9 text-muted-foreground" />
          <h2 className="text-base font-medium">
            Encuentra las imágenes que faltan
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Consulta el stock del ERP para revisar todas las marcas, edades y
            categorías en una sola lista.
          </p>
          <Link
            href="/admin/marketing/imagenes"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Ver imágenes guardadas
          </Link>
        </div>
      )}

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
