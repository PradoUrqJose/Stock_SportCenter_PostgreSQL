import { db } from "@/lib/db";
import { requireMarketing } from "@/lib/marketing";
import { FormNuevoCatalogo } from "@/components/admin/marketing/form-nuevo-catalogo";

async function valores(columna: "marca" | "grupo" | "genero"): Promise<string[]> {
  const r = await db.execute(`SELECT DISTINCT ${columna} AS v FROM productos WHERE ${columna} IS NOT NULL ORDER BY 1`);
  return r.rows.map((f) => f.v as string);
}

export default async function NuevoCatalogoPage() {
  await requireMarketing();
  const [marcas, grupos, generos] = await Promise.all([valores("marca"), valores("grupo"), valores("genero")]);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Nuevo catálogo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Se consulta el ERP con estos filtros y se arma una página por producto, ordenado por marca. Los productos sin
          imagen o sin stock se omiten y se avisa.
        </p>
      </div>
      <FormNuevoCatalogo opciones={{ marcas, grupos, generos }} />
    </div>
  );
}
