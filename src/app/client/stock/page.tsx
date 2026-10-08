import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db, toPlain } from "@/lib/db";
import { StockCliente } from "@/components/client/stock-cliente";

export type StockRow = {
  cod_barras: string; cod_universal: string; marca: string; modelo: string;
  talla: string; genero: string; alm_izq: string; alm_der: string;
  ocupado: boolean;
  traslado_activo_id: number | null;
};

export default async function ProductosPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const session = await requireRole("client");
  if (!session.tienda_id) return <p className="p-6">Este usuario no tiene sede asignada.</p>;
  const site = (await db.execute({ sql: "SELECT nombre,tipo FROM tiendas WHERE id=?", args: [session.tienda_id] })).rows[0];
  if (!site) return <p className="p-6">Sede no encontrada.</p>;
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? "1", 10) || 1));
  const scanned = /^[A-Z]\d{8,}$/.test(q.toUpperCase());
  const where = scanned ? "WHERE cod_barras=?" : q ? `WHERE cod_barras ILIKE ? OR cod_universal ILIKE ? OR marca ILIKE ? OR modelo ILIKE ?` : "";
  const args = scanned ? [q.toUpperCase()] : q ? Array(4).fill(`%${q}%`) : [];
  const [count, result, sites] = await Promise.all([
    db.execute({ sql: `SELECT COUNT(*) AS n FROM inventario_completo ${where}`, args }),
    db.execute({ sql: `SELECT i.cod_barras,i.cod_universal,i.marca,i.modelo,i.talla,i.genero,i.alm_izq,i.alm_der,i.ocupado,
      (SELECT t.id FROM traslados t WHERE t.cod_barras=i.cod_barras AND t.estado<>'recibido' LIMIT 1) AS traslado_activo_id
      FROM inventario_completo i ${where} ORDER BY i.marca,i.modelo,i.cod_barras LIMIT 50 OFFSET ?`, args: [...args, (page - 1) * 50] }),
    db.execute("SELECT nombre,tipo FROM tiendas ORDER BY nombre"),
  ]);
  const total = Number(count.rows[0]?.n ?? 0);
  return <div className="p-4 md:p-8 space-y-5">
    <div><h1 className="text-xl font-semibold">Stock completo</h1><p className="text-sm text-muted-foreground">{total.toLocaleString()} códigos · sede {String(site.nombre)}</p></div>
    <StockCliente items={toPlain<StockRow>(result.rows)} sites={toPlain<{nombre:string;tipo:string}>(sites.rows)} current={String(site.nombre)} warehouse={site.tipo === "almacen"} q={q} />
    <div className="flex items-center gap-4 text-sm">
      {page > 1 && <Link href={`/client/stock?q=${encodeURIComponent(q)}&page=${page - 1}`} className="underline">Anterior</Link>}
      <span>Página {page} de {Math.max(1, Math.ceil(total / 50))}</span>
      {page * 50 < total && <Link href={`/client/stock?q=${encodeURIComponent(q)}&page=${page + 1}`} className="underline">Siguiente</Link>}
    </div>
  </div>;
}
