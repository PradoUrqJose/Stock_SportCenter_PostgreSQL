"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generarCatalogo } from "@/lib/actions/marketing-catalogos";
import { ALMACENES, ALMACENES_POR_DEFECTO } from "@/lib/marketing-catalogo";

type Opciones = { marcas: string[]; grupos: string[]; generos: string[] };

const SELECT =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function FormNuevoCatalogo({ opciones }: { opciones: Opciones }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [titulo, setTitulo] = useState("");
  const [marca, setMarca] = useState("");
  const [grupo, setGrupo] = useState("");
  const [genero, setGenero] = useState("");
  const [almacenes, setAlmacenes] = useState<string[]>(ALMACENES_POR_DEFECTO);
  const [error, setError] = useState<string | null>(null);

  const alternar = (a: string, on: boolean) =>
    setAlmacenes((prev) => (on ? [...prev, a] : prev.filter((x) => x !== a)));

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await generarCatalogo({ titulo, almacenes, grupo, marca, genero });
      if (r.success && r.data) router.push(`/admin/marketing/catalogos/${r.data.id}/editar`);
      else setError(r.msg);
    });
  }

  const filtro = (id: string, etiqueta: string, valor: string, set: (v: string) => void, lista: string[]) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      <select id={id} className={SELECT} value={valor} onChange={(e) => set(e.target.value)} disabled={pendiente}>
        <option value="">Todos</option>
        {lista.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <form onSubmit={enviar} className="max-w-xl space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="titulo">Título del catálogo</Label>
        <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Adidas Zapatillas — Octubre" disabled={pendiente} maxLength={100} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {filtro("marca", "Marca", marca, setMarca, opciones.marcas)}
        {filtro("grupo", "Grupo", grupo, setGrupo, opciones.grupos)}
        {filtro("genero", "Género", genero, setGenero, opciones.generos)}
      </div>

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
        <Button type="submit" disabled={pendiente || titulo.trim().length < 3}>
          {pendiente ? "Consultando el ERP…" : "Generar catálogo"}
        </Button>
        {pendiente && (
          <p className="text-xs text-muted-foreground">Puede tardar hasta un minuto; no cierres esta página.</p>
        )}
      </div>
    </form>
  );
}
