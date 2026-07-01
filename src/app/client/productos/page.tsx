import { requireRole } from "@/lib/auth";
import { db, toPlain } from "@/lib/db";
import { ClientProductosTable } from "@/components/client/productos-table";

export type ClientProductoRow = {
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
  imagen_url: string | null;
  tiendas: string | null;
};

export default async function ClientProductosPage() {
  await requireRole("client");

  const result = await db.execute(
    `SELECT p.cod_universal, p.genero, p.marca, p.modelo, p.categoria, p.grupo, p.color,
            p.precio_lista, p.descuento, p.stock_total, pi.imagen_url,
            GROUP_CONCAT(DISTINCT t.nombre) AS tiendas
     FROM productos p
     LEFT JOIN producto_imagenes pi ON pi.cod_universal = p.cod_universal
     LEFT JOIN (
       SELECT cod_universal, genero, alm_izq AS alm FROM variantes WHERE alm_izq IS NOT NULL
       UNION
       SELECT cod_universal, genero, alm_der AS alm FROM variantes WHERE alm_der IS NOT NULL
     ) v ON v.cod_universal = p.cod_universal AND v.genero = p.genero
     LEFT JOIN tiendas t ON t.nombre = v.alm
     GROUP BY p.cod_universal, p.genero
     ORDER BY p.marca, p.modelo`
  );

  const productos = toPlain<ClientProductoRow>(result.rows);

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-xl font-semibold text-foreground">Productos</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        {productos.length > 0
          ? `${productos.length.toLocaleString("en-US")} productos en el espejo del ERP.`
          : "Sin productos cargados."}
      </p>
      <ClientProductosTable productos={productos} />
    </div>
  );
}
