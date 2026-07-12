import { requireRole, requireModule } from "@/lib/auth";
import { db, toPlain } from "@/lib/db";
import { ProductosTable } from "@/components/admin/productos/productos-table";
import { PageHelp } from "@/components/ui/page-help";

// La subida de stock corre server actions (initUpload/uploadXBatch/finalizeUpload)
// que Vercel factura al maxDuration de esta ruta, no al del archivo de actions.
// El default del plan (10s en Hobby) se queda corto para varios lotes de 2000 filas.
export const maxDuration = 60;

const HELP = [
  { term: "Precio lista", desc: "Precio del ERP sin descuento." },
  { term: "Descuento", desc: "% vigente en el sistema. El color corresponde al nivel (10, 20, …, 70)." },
  { term: "Precio dto", desc: "Precio final ya con el descuento aplicado." },
  { term: "Stock", desc: "Unidades disponibles (suma de variantes/tallas del producto)." },
  { term: "Actualizar stock", desc: "Sube el archivo del ERP y reemplaza el espejo de productos." },
];

export type ProductoRow = {
  cod_universal: string;
  genero: string;
  marca: string | null;
  modelo: string | null;
  categoria: string | null;
  grupo: string | null;
  color: string | null;
  precio_lista: number;
  descuento: number;
  stock_total: number;
};

export default async function ProductosPage() {
  const session = await requireRole("admin", "administrador_general");
  await requireModule(session, "productos");

  const result = await db.execute(
    `SELECT cod_universal, genero, marca, modelo, categoria, grupo, color,
            precio_lista, descuento, stock_total
     FROM productos
     ORDER BY marca, modelo`
  );

  const productos = toPlain<ProductoRow>(result.rows);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Productos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {productos.length > 0
              ? `${productos.length.toLocaleString("en-US")} productos en el espejo del ERP.`
              : "Sin productos cargados."}
          </p>
        </div>
        <PageHelp items={HELP} />
      </div>
      <ProductosTable productos={productos} />
    </div>
  );
}
