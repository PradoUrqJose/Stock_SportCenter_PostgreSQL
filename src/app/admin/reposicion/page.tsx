import { requireRole, requireModule } from "@/lib/auth";
import { db, toPlain } from "@/lib/db";
import { fetchLotePublicadoActivo } from "@/lib/queries/lotes";
import { ReposicionForm } from "@/components/admin/reposicion/reposicion-form";

export default async function ReposicionPage() {
  const session = await requireRole("admin", "administrador_general");
  await requireModule(session, "reposicion");

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
      <h1 className="text-xl font-semibold text-[#181d26]">Reposición</h1>
      <p className="mt-1 mb-6 text-sm text-[#41454d]">
        Sube un .txt con códigos universales repuestos — se identificarán los que aún tengan
        descuento activo para quitárselo.
      </p>
      <ReposicionForm borrador={borrador} publicado={publicado} />
    </div>
  );
}
