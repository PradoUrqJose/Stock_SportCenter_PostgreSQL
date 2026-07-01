import { requireRole, requireModule } from "@/lib/auth";
import { db, toPlain } from "@/lib/db";
import { ProductosTable } from "@/components/admin/productos/productos-table";

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
    <div className="p-8">
      <h1 className="text-xl font-semibold text-[#181d26]">Productos</h1>
      <p className="mt-1 mb-6 text-sm text-[#41454d]">
        {productos.length > 0
          ? `${productos.length.toLocaleString("en-US")} productos en el espejo del ERP.`
          : "Sin productos cargados."}
      </p>
      <ProductosTable productos={productos} />
    </div>
  );
}
