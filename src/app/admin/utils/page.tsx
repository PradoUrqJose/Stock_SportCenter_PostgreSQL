import { requireRole, requireModule } from "@/lib/auth";
import { db, toPlain } from "@/lib/db";
import { fetchLotePublicadoActivo } from "@/lib/queries/lotes";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ImagenesMasivoForm } from "@/components/admin/utils/imagenes-masivo-form";
import { DescuentosMasivoForm } from "@/components/admin/utils/descuentos-masivo-form";

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
    <div className="p-8">
      <h1 className="text-xl font-semibold text-[#181d26]">Utilidades</h1>
      <p className="mt-1 mb-6 text-sm text-[#41454d]">
        Carga masiva desde Excel: enlaza imágenes por código universal, o crea un borrador de
        descuentos por código universal.
      </p>
      <Tabs defaultValue="imagenes">
        <TabsList>
          <TabsTrigger value="imagenes">Imágenes</TabsTrigger>
          <TabsTrigger value="descuentos">Descuentos</TabsTrigger>
        </TabsList>
        <TabsContent value="imagenes">
          <ImagenesMasivoForm />
        </TabsContent>
        <TabsContent value="descuentos">
          <DescuentosMasivoForm borrador={borrador} publicado={publicado} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
