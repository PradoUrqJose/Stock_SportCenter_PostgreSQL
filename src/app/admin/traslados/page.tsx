import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db, toPlain } from "@/lib/db";
import { TrasladosPanel, type TrasladoRow } from "@/components/client/traslados-panel";
import { TrasladosUpload } from "@/components/admin/traslados-upload";

export default async function AdminTrasladosPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const session = await requireRole("admin", "administrador_general");
  const uploadPermission = session.rol === "administrador_general" || (await db.execute({ sql: "SELECT 1 FROM admin_modules WHERE user_id=? AND module_id='productos'", args: [session.id] })).rows.length > 0;
  const params = await searchParams;
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? "1", 10) || 1));
  const q = (params.q ?? "").trim().slice(0, 80);
  const where = q ? "WHERE cod_barras ILIKE ? OR origen ILIKE ? OR destino ILIKE ?" : "";
  const args = q ? Array(3).fill(`%${q}%`) : [];
  const [count, result, last] = await Promise.all([
    db.execute({ sql: `SELECT COUNT(*) AS n FROM traslados ${where}`, args }),
    db.execute({ sql: `SELECT t.id,t.cod_barras,t.cod_universal,t.descripcion,t.origen,t.destino,t.tipo,t.estado,t.atendido,
      to_char(t.creado_at AT TIME ZONE 'America/Lima','YYYY-MM-DD HH24:MI') AS creado_at,
      COALESCE((SELECT json_agg(json_build_object('lado',p.lado,'origen',p.origen,'estado',p.estado) ORDER BY p.lado)
        FROM traslado_partes p WHERE p.traslado_id=t.id),'[]'::json) AS partes
      FROM traslados t ${where} ORDER BY t.atendido, t.creado_at DESC LIMIT 50 OFFSET ?`, args: [...args, (page - 1) * 50] }),
    db.execute("SELECT filas,to_char(cargado_at AT TIME ZONE 'America/Lima','YYYY-MM-DD HH24:MI') AS fecha FROM inventario_cargas ORDER BY id DESC LIMIT 1"),
  ]);
  const total = Number(count.rows[0]?.n ?? 0);
  return <div className="p-4 md:p-8 space-y-5">
    <div><h1 className="text-xl font-semibold">Traslados de stock</h1><p className="text-sm text-muted-foreground">{total} transacciones · una fila por solicitud o envío</p></div>
    <p className="text-sm text-muted-foreground">Cada sede necesita un usuario Cliente para atender movimientos. Se aceptan credenciales de esa sede o globales activas.</p>
    {uploadPermission && <TrasladosUpload />}
    {last.rows[0] && <p className="text-sm text-muted-foreground">Última carga: {String(last.rows[0].filas)} códigos · {String(last.rows[0].fecha)}</p>}
    <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Código o sede" className="rounded border bg-background px-3 py-2 text-sm" /><button className="rounded bg-primary px-3 py-2 text-primary-foreground">Buscar</button></form>
    <TrasladosPanel rows={toPlain<TrasladoRow>(result.rows)} admin />
    <div className="flex gap-4 text-sm">{page > 1 && <Link href={`/admin/traslados?q=${encodeURIComponent(q)}&page=${page - 1}`} className="underline">Anterior</Link>}<span>Página {page} de {Math.max(1, Math.ceil(total / 50))}</span>{page * 50 < total && <Link href={`/admin/traslados?q=${encodeURIComponent(q)}&page=${page + 1}`} className="underline">Siguiente</Link>}</div>
  </div>;
}
