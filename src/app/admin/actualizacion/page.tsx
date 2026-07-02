import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireRole, requireModule } from "@/lib/auth";
import { db, toPlain } from "@/lib/db";
import { EditorTable } from "@/components/admin/actualizacion/editor-table";
import { fetchLotePublicadoActivo } from "@/lib/queries/lotes";
import { PageHelp } from "@/components/ui/page-help";

const HELP = [
  { term: "Descuento ERP", desc: "El descuento que hoy tiene el producto en el sistema." },
  { term: "Estado", desc: "Pendiente = sin cambio; Planeado = editado en el borrador; Publicado = ya en el lote activo." },
  { term: "Semáforo de rotación", desc: "Cobertura del stock según ventas: verde = rápida, ámbar = moderada, rojo = lenta (candidato a descuento), gris = sin datos." },
  { term: "Detalle (tooltip)", desc: "Al pasar el cursor: antigüedad del stock, vendido en 90 días y días de cobertura." },
  { term: "Desajuste", desc: "Líneas del último lote cerrado cuyo descuento ya no coincide con el ERP." },
  { term: "Destino", desc: "Dónde caen los cambios que guardas: al borrador o al lote publicado activo." },
];

export type LoteActivo = {
  id: number;
  estado: "borrador" | "publicado" | "cerrado";
  created_at: string;
} | null;

export type EditorProductoRow = {
  cod_universal: string;
  genero: string;
  marca: string | null;
  modelo: string | null;
  categoria: string | null;
  grupo: string | null;
  color: string | null;
  precio_lista: number;
  descuento: number;
  imagen_url: string | null;
};

export type LoteLineaRow = {
  cod_universal: string;
  genero: string;
  descuento_nuevo: number;
};

export type Desajuste = {
  loteId: number;
  n: number;
} | null;

export type RotacionRow = {
  cod_universal: string;
  genero: string;
  antiguedad_dias: number | null;
  vendido_90d: number;
  cobertura_dias: number | null;
};

export default async function ActualizacionPage() {
  const requestStart = Date.now();
  const session = await requireRole("admin", "administrador_general");
  await requireModule(session, "actualizacion");
  console.log(`[PERF][actualizacion] auth ${Date.now() - requestStart}ms`);

  const t1 = Date.now();
  const [loteResult, publicadoActivo, prodResult, ventasCountResult, cerradoResult] =
    await Promise.all([
      db.execute({
        sql: `SELECT id, estado, created_at FROM lotes WHERE estado = 'borrador' ORDER BY id DESC LIMIT 1`,
        args: [],
      }),
      fetchLotePublicadoActivo(),
      db.execute(
        `SELECT p.cod_universal, p.genero, p.marca, p.modelo, p.categoria, p.grupo, p.color,
                p.precio_lista, p.descuento, pi.imagen_url
         FROM productos p
         LEFT JOIN producto_imagenes pi ON pi.cod_universal = p.cod_universal
         ORDER BY p.marca, p.modelo`
      ),
      db.execute(`SELECT COUNT(*) AS n FROM ventas`),
      db.execute({
        sql: `SELECT id FROM lotes WHERE estado='cerrado' AND resanado_at IS NULL ORDER BY id DESC LIMIT 1`,
        args: [],
      }),
    ]);
  console.log(`[PERF][actualizacion] oleada 1 (5 queries) ${Date.now() - t1}ms`);

  const lote: LoteActivo =
    loteResult.rows.length > 0
      ? toPlain<NonNullable<LoteActivo>>(loteResult.rows)[0]
      : null;

  const productos = toPlain<EditorProductoRow>(prodResult.rows);

  const hasVentas = (ventasCountResult.rows[0].n as number) > 0;

  const cerradoId = cerradoResult.rows.length > 0 ? (cerradoResult.rows[0].id as number) : null;

  const t2 = Date.now();
  const [lineasResult, lineasPubResult, rotResult, nResult] = await Promise.all([
    lote?.estado === "borrador"
      ? db.execute({
          sql: `SELECT cod_universal, genero, descuento_nuevo FROM lote_lineas WHERE lote_id = ?`,
          args: [lote.id],
        })
      : Promise.resolve(null),
    publicadoActivo
      ? db.execute({
          sql: `SELECT cod_universal, genero, descuento_nuevo FROM lote_lineas WHERE lote_id = ?`,
          args: [publicadoActivo.id],
        })
      : Promise.resolve(null),
    hasVentas
      ? db.execute(`
          WITH antigs AS (
            SELECT cod_universal, genero, MIN(ingreso_fecha) AS primera_entrada
            FROM variantes WHERE ingreso_fecha IS NOT NULL
            GROUP BY cod_universal, genero
          ),
          vel AS (
            SELECT cod_universal, genero, COUNT(*) AS vendido_90d
            FROM ventas
            WHERE fecha_venta >= date('now', '-90 days')
              AND cod_universal IS NOT NULL AND genero IS NOT NULL
            GROUP BY cod_universal, genero
          )
          SELECT p.cod_universal, p.genero,
            CAST(ROUND(julianday('now') - julianday(a.primera_entrada)) AS INTEGER) AS antiguedad_dias,
            COALESCE(vel.vendido_90d, 0) AS vendido_90d,
            CASE
              WHEN COALESCE(vel.vendido_90d, 0) > 0
              THEN CAST(ROUND(p.stock_total / (COALESCE(vel.vendido_90d, 0) / 90.0)) AS INTEGER)
              ELSE NULL
            END AS cobertura_dias
          FROM productos p
          LEFT JOIN antigs a ON a.cod_universal = p.cod_universal AND a.genero = p.genero
          LEFT JOIN vel ON vel.cod_universal = p.cod_universal AND vel.genero = p.genero
        `)
      : Promise.resolve(null),
    cerradoId !== null
      ? db.execute({
          sql: `SELECT COUNT(*) AS n
                FROM lote_lineas ll
                JOIN productos p ON p.cod_universal = ll.cod_universal AND p.genero = ll.genero
                WHERE ll.lote_id = ?
                  AND ABS(ll.descuento_nuevo - p.descuento) > 0.001`,
          args: [cerradoId],
        })
      : Promise.resolve(null),
  ]);
  console.log(`[PERF][actualizacion] oleada 2 (4 queries) ${Date.now() - t2}ms`);

  const lineas: LoteLineaRow[] = lineasResult ? toPlain<LoteLineaRow>(lineasResult.rows) : [];
  const lineasPublicadas: LoteLineaRow[] = lineasPubResult
    ? toPlain<LoteLineaRow>(lineasPubResult.rows)
    : [];
  const rotacion: RotacionRow[] = rotResult ? toPlain<RotacionRow>(rotResult.rows) : [];

  // Desajuste: most recent cerrado lote with resanado_at IS NULL where ERP baseline diverges
  let desajuste: Desajuste = null;
  if (cerradoId !== null && nResult) {
    const n = nResult.rows[0].n as number;
    if (n > 0) desajuste = { loteId: cerradoId, n };
  }

  console.log(`[PERF][actualizacion] total ${Date.now() - requestStart}ms`);

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Editor de descuentos</h1>
        <div className="flex flex-wrap items-center gap-3">
          {publicadoActivo && (
            <Link
              href="/admin/actualizacion-updates"
              className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 dark:border-green-500/25 bg-green-50 dark:bg-green-500/10 px-3 py-1.5 text-sm font-medium text-green-800 dark:text-green-300 hover:bg-green-100 transition-colors"
            >
              {`Lote #${publicadoActivo.id} publicado — gestionar en Registro de cambios`}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
          <PageHelp items={HELP} />
        </div>
      </div>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        {productos.length > 0
          ? `${productos.length.toLocaleString("en-US")} productos · planea los descuentos del próximo lote.`
          : "Sin productos cargados. Sube el stock primero."}
      </p>
      <EditorTable
        productos={productos}
        lote={lote}
        lineas={lineas}
        lineasPublicadas={lineasPublicadas}
        desajuste={desajuste}
        rotacion={rotacion}
        publicadoActivo={publicadoActivo}
      />
    </div>
  );
}
