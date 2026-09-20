import { db } from "@/lib/db";
import { requireMarketing } from "@/lib/marketing";
import { FormNuevoCatalogo } from "@/components/admin/marketing/form-nuevo-catalogo";
import { ProgresoGeneracion } from "@/components/admin/marketing/progreso-generacion";

// Valores que existen hoy en los productos, los más frecuentes primero.
async function valores(columna: "marca" | "grupo" | "genero" | "categoria"): Promise<string[]> {
  const r = await db.execute(
    `SELECT ${columna} AS v FROM productos WHERE ${columna} IS NOT NULL GROUP BY 1 ORDER BY COUNT(*) DESC, 1`
  );
  return r.rows.map((f) => f.v as string);
}

export default async function NuevoCatalogoPage({ searchParams }: { searchParams: Promise<{ generacion?: string }> }) {
  await requireMarketing();
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

  const [marcas, grupos, generos, categorias] = await Promise.all([
    valores("marca"),
    valores("grupo"),
    valores("genero"),
    valores("categoria"),
  ]);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Nuevo catálogo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Elige un tipo de catálogo (o los filtros a mano): se consulta el ERP y se arma una página por producto y género,
          ordenado por marca. Los productos sin imagen o sin stock se omiten y se avisa.
        </p>
      </div>
      <FormNuevoCatalogo opciones={{ marcas, grupos, generos, categorias }} />
    </div>
  );
}
