import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { IMAGENES_BASE, ORIGEN_IMAGENES, requireMarketing } from "@/lib/marketing";
import { ordenarOpcionesTalla } from "@/lib/marketing-catalogo";
import { fijasGestion } from "@/lib/marketing-catalogos-datos";
import { tiposCatalogo } from "@/lib/marketing-tipos";
import { GestorTipos } from "@/components/admin/marketing/gestor-tipos";
import { preconnect } from "react-dom";

// Valores que existen hoy en los productos, los más frecuentes primero.
async function valores(columna: "marca" | "grupo" | "genero" | "categoria"): Promise<string[]> {
  const r = await db.execute(`SELECT ${columna} AS v FROM productos WHERE ${columna} IS NOT NULL GROUP BY 1 ORDER BY COUNT(*) DESC, 1`);
  return r.rows.map((f) => f.v as string);
}

/** Tipos de catálogo: los de fábrica y los personalizados; crear, editar, activar, borrar y asociar la portada de cada uno. */
export default async function TiposPage() {
  await requireMarketing();
  preconnect(ORIGEN_IMAGENES);
  const [tipos, fijas, marcas, grupos, generos, categorias, tallas] = await Promise.all([
    tiposCatalogo(),
    fijasGestion(),
    valores("marca"),
    valores("grupo"),
    valores("genero"),
    valores("categoria"),
    db.execute("SELECT DISTINCT UPPER(TRIM(talla)) AS v FROM variantes WHERE talla IS NOT NULL AND TRIM(talla) <> ''"),
  ]);

  return (
    <div className="p-4 md:p-8">
      <Link href="/admin/marketing/catalogos" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" /> Catálogos
      </Link>
      <h1 className="mb-4 text-xl font-semibold text-foreground">Tipos de catálogo</h1>
      <GestorTipos
        base={IMAGENES_BASE}
        tipos={tipos}
        portadas={fijas.filter((f) => f.tipo === "portada")}
        opciones={{ marcas, grupos, generos, categorias, tallas: ordenarOpcionesTalla(tallas.rows.map((r) => r.v as string)) }}
      />
    </div>
  );
}
