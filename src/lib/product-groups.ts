import type { ConfirmacionFlatRow } from "@/components/admin/actualizacion/confirmaciones-panel";

export type EstadoResumen = "pendiente" | "confirmado" | "con rechazos";

export type ProductGroup = {
  key: string;
  cod_universal: string;
  genero: string;
  snap_marca: string | null;
  snap_modelo: string | null;
  snap_precio_lista: number | null;
  precio_final: number | null;
  descuento_antes: number;
  descuento_nuevo: number;
  n_pendiente: number;
  n_confirmado: number;
  n_rechazado: number;
  estadoResumen: EstadoResumen;
  tiendas: ConfirmacionFlatRow[];
};

export type ProductGroupTotals = {
  pendiente: number;
  confirmado: number;
  rechazado: number;
  total: number;
};

export function groupConfirmaciones(rows: ConfirmacionFlatRow[]): {
  groups: ProductGroup[];
  totals: ProductGroupTotals;
} {
  const map = new Map<string, ProductGroup>();
  for (const r of rows) {
    const key = `${r.cod_universal}|${r.genero}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        cod_universal: r.cod_universal,
        genero: r.genero,
        snap_marca: r.snap_marca,
        snap_modelo: r.snap_modelo,
        snap_precio_lista: r.snap_precio_lista,
        precio_final:
          r.snap_precio_lista !== null
            ? r.snap_precio_lista * (1 - r.descuento_nuevo / 100)
            : null,
        descuento_antes: r.descuento_antes,
        descuento_nuevo: r.descuento_nuevo,
        n_pendiente: 0,
        n_confirmado: 0,
        n_rechazado: 0,
        estadoResumen: "confirmado",
        tiendas: [],
      });
    }
    const g = map.get(key)!;
    g.tiendas.push(r);
    if (r.estado === "pendiente") g.n_pendiente++;
    else if (r.estado === "confirmado") g.n_confirmado++;
    else g.n_rechazado++;
  }

  const groups = [...map.values()];
  for (const g of groups) {
    g.estadoResumen = g.n_rechazado > 0 ? "con rechazos" : g.n_pendiente > 0 ? "pendiente" : "confirmado";
  }

  const totals = groups.reduce(
    (acc, g) => ({
      pendiente: acc.pendiente + g.n_pendiente,
      confirmado: acc.confirmado + g.n_confirmado,
      rechazado: acc.rechazado + g.n_rechazado,
      total: acc.total + g.tiendas.length,
    }),
    { pendiente: 0, confirmado: 0, rechazado: 0, total: 0 }
  );

  return { groups, totals };
}
