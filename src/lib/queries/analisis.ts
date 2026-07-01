import { db, toPlain } from "@/lib/db";
import { DIAS_REZAGO } from "@/lib/analisis/clasificacion";

export type AnalisisKpis = {
  unidades: number;
  desde: string | null;
  hasta: string | null;
  importe_total: number;
  dias_prom: number | null;
};

export type ProductoAnalisisRow = {
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
  unidades: number; // vendidas en todo el histórico
  vendido_90d: number;
  ultima_venta: string | null;
  dias_prom: number | null; // días para vender (promedio)
  importe_total: number;
  dias_ultimo_ingreso: number | null;
  dias_primer_ingreso: number | null;
  unidades_viejas: number; // unidades en stock con antigüedad >= DIAS_REZAGO
  cobertura_dias: number | null;
};

export type MesRow = { mes: string; unidades: number; importe: number };

// Ranking a nivel de MODELO real (cruce marca · modelo · género), no de marca suelta.
export type ModeloRankingRow = {
  marca: string | null;
  modelo: string | null;
  genero: string | null;
  categoria: string | null;
  unidades: number;
  importe: number;
};

export async function hasVentas(): Promise<boolean> {
  const r = await db.execute(`SELECT COUNT(*) AS n FROM ventas`);
  return (r.rows[0].n as number) > 0;
}

export async function fetchAnalisisKpis(): Promise<AnalisisKpis> {
  const r = await db.execute(`
    SELECT COUNT(*) AS unidades,
      MIN(fecha_venta) AS desde,
      MAX(fecha_venta) AS hasta,
      SUM(COALESCE(importe, 0)) AS importe_total,
      AVG(CASE WHEN ingreso_fecha IS NOT NULL AND julianday(fecha_venta) >= julianday(ingreso_fecha)
               THEN julianday(fecha_venta) - julianday(ingreso_fecha) END) AS dias_prom
    FROM ventas
  `);
  const row = toPlain<AnalisisKpis & { dias_prom: number | null }>(r.rows)[0];
  return {
    unidades: row.unidades ?? 0,
    desde: row.desde ?? null,
    hasta: row.hasta ?? null,
    importe_total: row.importe_total ?? 0,
    dias_prom: row.dias_prom != null ? Math.round(row.dias_prom) : null,
  };
}

// Una fila por producto (cod_universal, genero) con métricas de venta + antigüedad de stock.
export async function fetchProductosAnalisis(): Promise<ProductoAnalisisRow[]> {
  const r = await db.execute(`
    WITH v AS (
      SELECT cod_universal, genero,
        COUNT(*) AS unidades,
        SUM(CASE WHEN fecha_venta >= date('now', '-90 days') THEN 1 ELSE 0 END) AS vendido_90d,
        MAX(fecha_venta) AS ultima_venta,
        AVG(CASE WHEN ingreso_fecha IS NOT NULL AND julianday(fecha_venta) >= julianday(ingreso_fecha)
                 THEN julianday(fecha_venta) - julianday(ingreso_fecha) END) AS dias_prom,
        SUM(COALESCE(importe, 0)) AS importe_total
      FROM ventas
      WHERE cod_universal IS NOT NULL AND genero IS NOT NULL
      GROUP BY cod_universal, genero
    ),
    ant AS (
      SELECT cod_universal, genero,
        CAST(ROUND(julianday('now') - julianday(MAX(ingreso_fecha))) AS INTEGER) AS dias_ultimo_ingreso,
        CAST(ROUND(julianday('now') - julianday(MIN(ingreso_fecha))) AS INTEGER) AS dias_primer_ingreso,
        SUM(CASE WHEN julianday('now') - julianday(ingreso_fecha) >= ${DIAS_REZAGO} THEN 1 ELSE 0 END) AS unidades_viejas
      FROM variantes WHERE ingreso_fecha IS NOT NULL
      GROUP BY cod_universal, genero
    )
    SELECT p.cod_universal, p.genero, p.marca, p.modelo, p.categoria, p.grupo, p.color,
      p.precio_lista, p.descuento, p.stock_total,
      COALESCE(v.unidades, 0) AS unidades,
      COALESCE(v.vendido_90d, 0) AS vendido_90d,
      v.ultima_venta,
      CAST(ROUND(v.dias_prom) AS INTEGER) AS dias_prom,
      COALESCE(v.importe_total, 0) AS importe_total,
      a.dias_ultimo_ingreso, a.dias_primer_ingreso,
      COALESCE(a.unidades_viejas, 0) AS unidades_viejas,
      CASE WHEN COALESCE(v.vendido_90d, 0) > 0
           THEN CAST(ROUND(p.stock_total / (v.vendido_90d / 90.0)) AS INTEGER)
           ELSE NULL END AS cobertura_dias
    FROM productos p
    LEFT JOIN v ON v.cod_universal = p.cod_universal AND v.genero = p.genero
    LEFT JOIN ant a ON a.cod_universal = p.cod_universal AND a.genero = p.genero
  `);
  return toPlain<ProductoAnalisisRow>(r.rows);
}

export async function fetchTendenciaMensual(): Promise<MesRow[]> {
  const r = await db.execute(`
    SELECT substr(fecha_venta, 1, 7) AS mes,
      COUNT(*) AS unidades,
      SUM(COALESCE(importe, 0)) AS importe
    FROM ventas
    GROUP BY mes ORDER BY mes
  `);
  return toPlain<MesRow>(r.rows);
}

// Modelos más vendidos (marca · modelo · género). La categoría se conserva para poder
// filtrar "los modelos más vendidos por categoría" en la tabla.
export async function fetchModelosRanking(): Promise<ModeloRankingRow[]> {
  const r = await db.execute(`
    SELECT marca, modelo, genero, MIN(categoria) AS categoria,
      COUNT(*) AS unidades, SUM(COALESCE(importe, 0)) AS importe
    FROM ventas
    WHERE modelo IS NOT NULL
    GROUP BY marca, modelo, genero
    ORDER BY unidades DESC
  `);
  return toPlain<ModeloRankingRow>(r.rows);
}
