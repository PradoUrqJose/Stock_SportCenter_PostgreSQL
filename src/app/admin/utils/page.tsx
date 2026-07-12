import { requireRole, requireModule } from "@/lib/auth";
import { db, toPlain } from "@/lib/db";
import { fetchLotePublicadoActivo } from "@/lib/queries/lotes";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ImagenesMasivoForm } from "@/components/admin/utils/imagenes-masivo-form";
import { DescuentosMasivoForm } from "@/components/admin/utils/descuentos-masivo-form";
import { VendedoresMasivoForm } from "@/components/admin/utils/vendedores-masivo-form";
import { PageHelp } from "@/components/ui/page-help";

const HELP = [
  { term: "Imágenes", desc: "Excel con columnas CODE y ENLACE. Se previsualizan las imágenes antes de aplicarlas al catálogo." },
  { term: "Descuentos", desc: "Excel con cod_universal y descuento. Muestra antes (ERP) vs después (Excel) por producto." },
  { term: "Vendedores", desc: "Excel con Usuario, Nombre, Credencial y Activo (opcional). Se crean sin tienda asignada (credencial global)." },
  { term: "Selección", desc: "Marca las filas que quieres aplicar; el resto se ignora." },
  { term: "Guardar", desc: "Crea o actualiza un borrador de descuentos con los códigos seleccionados." },
];

export default async function UtilsPage() {
  const session = await requireRole("admin", "administrador_general");
  await requireModule(session, "utils");

  const borradorResult = await db.execute({
    sql: `SELECT id, created_at FROM lotes WHERE estado = 'borrador' ORDER BY id DESC LIMIT 1`,
    args: [],
  });
  const borrador =
    borradorResult.rows.length > 0
      ? toPlain<{ id: number; created_at: string }>(borradorResult.rows)[0]
      : null;

  const publicado = await fetchLotePublicadoActivo();

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Utilidades</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Carga masiva desde Excel: enlaza imágenes por código universal, o crea un borrador de
            descuentos por código universal.
          </p>
        </div>
        <PageHelp items={HELP} />
      </div>
      <Tabs defaultValue="imagenes">
        <TabsList>
          <TabsTrigger value="imagenes">Imágenes</TabsTrigger>
          <TabsTrigger value="descuentos">Descuentos</TabsTrigger>
          <TabsTrigger value="vendedores">Vendedores</TabsTrigger>
        </TabsList>
        <TabsContent value="imagenes">
          <ImagenesMasivoForm />
        </TabsContent>
        <TabsContent value="descuentos">
          <DescuentosMasivoForm borrador={borrador} publicado={publicado} />
        </TabsContent>
        <TabsContent value="vendedores">
          <VendedoresMasivoForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
