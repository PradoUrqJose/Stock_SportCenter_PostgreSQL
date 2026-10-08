import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db, toPlain } from "@/lib/db";
import { TrasladosPanel, type TrasladoRow } from "@/components/client/traslados-panel";

export default async function ClientTrasladosPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await requireRole("client");
  if (!session.tienda_id) return <p className="p-6">Este usuario no tiene sede asignada.</p>;
  const sede = (await db.execute({ sql: "SELECT nombre FROM tiendas WHERE id=?", args: [session.tienda_id] })).rows[0]?.nombre as string;
  const page = Math.max(1, Math.min(10000, Number.parseInt((await searchParams).page ?? "1", 10) || 1));
  const result = await db.execute({ sql: `SELECT t.id,t.cod_barras,t.cod_universal,t.descripcion,t.origen,t.destino,t.tipo,t.estado,t.atendido,
    to_char(t.creado_at AT TIME ZONE 'America/Lima','YYYY-MM-DD HH24:MI') AS creado_at,
    COALESCE((SELECT json_agg(json_build_object('lado',p.lado,'origen',p.origen,'estado',p.estado) ORDER BY p.lado)
      FROM traslado_partes p WHERE p.traslado_id=t.id),'[]'::json) AS partes
    FROM traslados t WHERE t.destino=? OR EXISTS (SELECT 1 FROM traslado_partes p WHERE p.traslado_id=t.id AND p.origen=?)
    ORDER BY CASE WHEN EXISTS (SELECT 1 FROM traslado_partes p WHERE p.traslado_id=t.id
      AND ((p.origen=? AND p.estado='solicitado') OR (t.destino=? AND p.estado='enviado'))) THEN 0 ELSE 1 END,
      t.creado_at DESC LIMIT 50 OFFSET ?`, args: [sede, sede, sede, sede, (page - 1) * 50] });
  return <div className="p-4 md:p-8 space-y-5"><div><h1 className="text-xl font-semibold">Solicitudes y envíos</h1><p className="text-sm text-muted-foreground">{sede} · pendientes primero</p></div>
    <TrasladosPanel rows={toPlain<TrasladoRow>(result.rows)} current={sede} />
    <div className="flex gap-4 text-sm">{page > 1 && <Link href={`/client/traslados?page=${page - 1}`} className="underline">Anterior</Link>}<span>Página {page}</span>{result.rows.length === 50 && <Link href={`/client/traslados?page=${page + 1}`} className="underline">Siguiente</Link>}</div>
  </div>;
}
