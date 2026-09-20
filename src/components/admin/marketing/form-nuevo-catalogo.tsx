"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { iniciarGeneracion } from "@/lib/actions/marketing-catalogos";
import { ALMACENES, ALMACENES_POR_DEFECTO, TIPOS_CATALOGO } from "@/lib/marketing-catalogo";
import { cn } from "@/lib/utils";

type Opciones = { marcas: string[]; grupos: string[]; generos: string[]; categorias: string[] };

/** «Septiembre 2026»: mes y año de hoy para el título sugerido. */
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
          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-foreground hover:bg-muted"
          aria-label={`Quitar ${v}`}
        >
          {v} <X className="h-3 w-3 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}

export function FormNuevoCatalogo({ opciones }: { opciones: Opciones }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [titulo, setTitulo] = useState("");
  const [tituloSugerido, setTituloSugerido] = useState("");
  const [tipo, setTipo] = useState("");
  const [categorias, setCategorias] = useState<string[]>([]);
  const [grupos, setGrupos] = useState<string[]>([]);
  const [generos, setGenero] = useState<string[]>([]);
  const [marcas, setMarcas] = useState<string[]>([]);
  const [precioMin, setPrecioMin] = useState("");
  const [precioMax, setPrecioMax] = useState("");
  const [almacenes, setAlmacenes] = useState<string[]>(ALMACENES_POR_DEFECTO);
  const [error, setError] = useState<string | null>(null);

  const alternar = (a: string, on: boolean) =>
    setAlmacenes((prev) => (on ? [...prev, a] : prev.filter((x) => x !== a)));

  // Elegir un tipo llena grupo, género y categoría (las marcas y el precio se conservan); después se puede ajustar todo.
  function elegirTipo(id: string) {
    setTipo(id);
    const t = TIPOS_CATALOGO.find((x) => x.id === id);
    if (!t) return;
    setCategorias([...t.categorias]);
    setGrupos([...t.grupos]);
    setGenero([...t.generos]);
    // El título se sugiere mientras no se haya escrito uno propio.
    if (titulo.trim() === "" || titulo === tituloSugerido) {
      const sugerido = `${t.nombre} — ${mesYAnio()}`;
      setTitulo(sugerido);
      setTituloSugerido(sugerido);
    }
  }

  // Cambiar a mano lo que define el tipo lo vuelve un catálogo «a mano».
  const editar = (set: (v: string[]) => void) => (v: string[]) => {
    setTipo("");
    set(v);
  };

  const numero = (v: string): number | null => (v.trim() === "" ? null : Number(v));

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const min = numero(precioMin);
    const max = numero(precioMax);
    if ((min !== null && Number.isNaN(min)) || (max !== null && Number.isNaN(max))) {
      setError("El precio debe ser un número");
      return;
    }
    iniciar(async () => {
      const r = await iniciarGeneracion({ titulo, tipo, almacenes, grupos, marcas, generos, categorias, precio_min: min, precio_max: max });
      // La generación sigue en segundo plano: se pasa a la pantalla de avance.
      if (r.success && r.data) router.push(`/admin/marketing/catalogos/nuevo?generacion=${r.data.id}`);
      else setError(r.msg);
    });
  }

  const sinFiltro = grupos.length + marcas.length + generos.length + categorias.length === 0;

  return (
    <form onSubmit={enviar} className="max-w-2xl space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="titulo">Título del catálogo</Label>
        <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Hombre — Octubre" disabled={pendiente} maxLength={100} />
      </div>

      <fieldset className="space-y-2" disabled={pendiente}>
        <legend className="text-sm font-medium">Tipo de catálogo</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {TIPOS_CATALOGO.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tipo === t.id}
              onClick={() => elegirTipo(t.id)}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-left transition-colors",
                tipo === t.id ? "border-foreground bg-muted" : "border-border hover:bg-muted/50"
              )}
            >
              <span className="block text-sm font-medium text-foreground">{t.nombre}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{t.descripcion}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {tipo ? "Los filtros de abajo se llenaron solos y puedes ajustarlos." : "Sin tipo: elige los filtros a mano."}
        </p>
      </fieldset>

      <fieldset className="space-y-3" disabled={pendiente}>
        <legend className="text-sm font-medium">Filtros</legend>
        <div className="flex flex-wrap gap-2">
          <MultiSelectFilter label="Categoría" options={opciones.categorias} selected={categorias} onChange={editar(setCategorias)} />
          <MultiSelectFilter label="Grupo" options={opciones.grupos} selected={grupos} onChange={editar(setGrupos)} />
          <MultiSelectFilter label="Género" options={opciones.generos} selected={generos} onChange={editar(setGenero)} />
          <MultiSelectFilter label="Marca" options={opciones.marcas} selected={marcas} onChange={setMarcas} />
        </div>
        <div className="space-y-2">
          <Chips valores={categorias.map((v) => v)} alQuitar={(v) => editar(setCategorias)(categorias.filter((x) => x !== v))} />
          <Chips valores={grupos} alQuitar={(v) => editar(setGrupos)(grupos.filter((x) => x !== v))} />
          <Chips valores={generos} alQuitar={(v) => editar(setGenero)(generos.filter((x) => x !== v))} />
          <Chips valores={marcas} alQuitar={(v) => setMarcas(marcas.filter((x) => x !== v))} />
        </div>
        {sinFiltro && <p className="text-xs text-muted-foreground">Elige un tipo o al menos un filtro; sin ninguno se traería todo el ERP.</p>}
      </fieldset>

      <fieldset className="space-y-2" disabled={pendiente}>
        <legend className="text-sm font-medium">Precio lista (S/)</legend>
        <div className="flex items-center gap-2">
          <Input type="number" inputMode="decimal" min={0} value={precioMin} onChange={(e) => setPrecioMin(e.target.value)} placeholder="Desde" className="w-32" aria-label="Precio desde" />
          <span className="text-sm text-muted-foreground">a</span>
          <Input type="number" inputMode="decimal" min={0} value={precioMax} onChange={(e) => setPrecioMax(e.target.value)} placeholder="Hasta" className="w-32" aria-label="Precio hasta" />
        </div>
      </fieldset>

      <fieldset className="space-y-2" disabled={pendiente}>
        <legend className="text-sm font-medium">Almacenes</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {ALMACENES.map((a) => (
            <label key={a} className="flex items-center gap-2 text-sm">
              <Checkbox checked={almacenes.includes(a)} onCheckedChange={(v) => alternar(a, v === true)} />
              {a}
            </label>
          ))}
        </div>
      </fieldset>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pendiente || titulo.trim().length < 3 || sinFiltro || almacenes.length === 0}>
          {pendiente ? "Iniciando…" : "Generar catálogo"}
        </Button>
        <p className="text-xs text-muted-foreground">Corre en segundo plano: verás el avance y puedes salir de la pantalla.</p>
      </div>
    </form>
  );
}
