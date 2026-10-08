import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function HistorialTraslado({ id, admin }: { id: number; admin: boolean }) {
  const session = await getSession();
  if (!session || !Number.isSafeInteger(id)) return <p>Sin permisos.</p>;
  if (admin && session.rol === "client") return <p>Sin permisos.</p>;
  if (!admin && (session.rol !== "client" || !session.tienda_id)) return <p>Sin permisos.</p>;
  const sede = !admin ? (await db.execute({ sql: "SELECT nombre FROM tiendas WHERE id=?", args: [session.tienda_id] })).rows[0]?.nombre : null;
  const row = (await db.execute({ sql: `SELECT * FROM traslados t WHERE t.id=? ${admin ? "" : "AND (t.destino=? OR EXISTS (SELECT 1 FROM traslado_partes p WHERE p.traslado_id=t.id AND p.origen=?))"}`,
    args: admin ? [id] : [id, sede, sede] })).rows[0];
  if (!row) return <p>Traslado no encontrado.</p>;
  const events = (await db.execute({ sql: `SELECT estado,lado,sede,usuario,credencial,
    to_char(creado_at AT TIME ZONE 'America/Lima','YYYY-MM-DD HH24:MI:SS') AS fecha
    FROM traslado_eventos WHERE traslado_id=? ORDER BY id`, args: [id] })).rows;
  return <div className="p-4 md:p-8 space-y-5"><h1 className="text-xl font-semibold">Historial de {String(row.cod_barras)}</h1>
    <p className="text-sm">{String(row.descripcion)} · {String(row.origen)} → {String(row.destino)}</p>
    <ol className="space-y-2">{events.map((event, i) => <li key={i} className="rounded border p-3 text-sm">
      <strong className="capitalize">{event.lado ? `${String(event.lado).toUpperCase()}: ` : ""}{String(event.estado)}</strong> · {String(event.fecha)}<br/>
      {String(event.usuario)} {event.sede ? `(${String(event.sede)})` : ""} {event.credencial ? "· credencial validada" : ""}
    </li>)}</ol>
  </div>;
}
