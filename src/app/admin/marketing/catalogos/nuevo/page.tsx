import { Montserrat } from "next/font/google";
import { db } from "@/lib/db";
import { IMAGENES_BASE, ORIGEN_IMAGENES, requireMarketing } from "@/lib/marketing";
import { fijasGestion, plantillasGestion } from "@/lib/marketing-catalogos-datos";
import { ordenarOpcionesTalla } from "@/lib/marketing-catalogo";
import { tiposCatalogo } from "@/lib/marketing-tipos";
import { AsistenteCatalogo } from "@/components/admin/marketing/asistente-catalogo";
import { preconnect } from "react-dom";
import { ProgresoGeneracion } from "@/components/admin/marketing/progreso-generacion";

// Tipografía del diseño (la misma del catálogo): el editor de posiciones del texto la usa para mostrar el ejemplo real.
const montserrat = Montserrat({ subsets: ["latin"], weight: "900", display: "swap" });

// Valores que existen hoy en los productos, los más frecuentes primero.
async function valores(columna: "marca" | "grupo" | "genero" | "categoria"): Promise<string[]> {
  const r = await db.execute(
    `SELECT ${columna} AS v FROM productos WHERE ${columna} IS NOT NULL GROUP BY 1 ORDER BY COUNT(*) DESC, 1`
  );
  return r.rows.map((f) => f.v as string);
}

// Tallas que existen en los productos (escala USA del ERP), para el filtro de talla.
async function valoresTalla(): Promise<string[]> {
  const r = await db.execute("SELECT DISTINCT UPPER(TRIM(talla)) AS v FROM variantes WHERE talla IS NOT NULL AND TRIM(talla) <> ''");
  return ordenarOpcionesTalla(r.rows.map((f) => f.v as string));
}

// La generación corre en segundo plano (`after`) dentro de esta misma función: necesita más que los 10 s por defecto
// (consulta al ERP en paralelo, hasta ~35 s, más armar el catálogo). 60 s es el máximo del plan Hobby.
export const maxDuration = 60;

export default async function NuevoCatalogoPage({ searchParams }: { searchParams: Promise<{ generacion?: string }> }) {
  await requireMarketing();
  preconnect(ORIGEN_IMAGENES);
  const { generacion } = await searchParams;

  // Con ?generacion=<id> se muestra el avance de esa generación en lugar del formulario.
  if (generacion) {
    const g = await db.execute({ sql: "SELECT titulo FROM mk_generaciones WHERE id = ?", args: [generacion] });
    if (g.rows.length > 0) {
      return (
        <div className="p-4 md:p-8">
          <h1 className="mb-6 text-xl font-semibold text-foreground">Generando catálogo</h1>
          <ProgresoGeneracion id={generacion} titulo={g.rows[0].titulo as string} />
        </div>
      );
    }
  }

  const [marcas, grupos, generos, categorias, tallas, tipos, plantillas, fijas, ejemplo] = await Promise.all([
    valores("marca"),
    valores("grupo"),
    valores("genero"),
    valores("categoria"),
    valoresTalla(),
    tiposCatalogo({ soloActivos: true }),
    plantillasGestion(),
    fijasGestion(),
    // Zapatilla de ejemplo para acomodar su posición: una conocida si existe y, si no, la primera imagen.
    db.execute("SELECT cod_universal, version FROM mk_imagenes ORDER BY (cod_universal = 'IG6410') DESC, cod_universal LIMIT 1"),
  ]);
  const fila = ejemplo.rows[0];

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Nuevo catálogo</h1>
      </div>
      <AsistenteCatalogo
        recursos={{
          base: IMAGENES_BASE,
          plantillas,
          fijas,
          ejemplo: fila ? { cod: fila.cod_universal as string, v: fila.version as number } : null,
          tipos,
          fuente: montserrat.style.fontFamily,
          opciones: { marcas, grupos, generos, categorias, tallas },
        }}
      />
    </div>
  );
}
