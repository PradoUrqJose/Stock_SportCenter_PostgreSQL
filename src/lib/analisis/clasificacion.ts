// Clasificación de salud de un producto cruzando 3 ejes:
// antigüedad del stock × velocidad de venta × descuento actual.
// Ver PLAN-ANALISIS-VENTAS.md §7.

// Umbral (días) sin ventas + antigüedad para considerar un producto "muerto".
export const DIAS_MUERTO = 90;

// Umbral (días) de antigüedad de una unidad en stock para considerarla "rezagada":
// sigue en el almacén pese a que su producto sí rota (el promedio la enmascara).
export const DIAS_REZAGO = 180;

// Descuento a partir del cual se considera "alto" (no responde al precio si aun así no rota;
// o fuga de margen si rota bien).
export const DESC_ALTO = 40;

export type NivelSalud =
  | "sano"
  | "fuga_margen"
  | "reciente"
  | "muerto_sin_desc"
  | "muerto_con_desc"
  | "muerto_desc_alto";

export type SaludInfo = {
  nivel: NivelSalud;
  label: string;
  dot: string; // clases tailwind para el punto de color
  accion: string;
  muerto: boolean;
};

export type SaludInput = {
  stock_total: number;
  vendido_90d: number; // unidades vendidas en la ventana reciente
  dias_ultimo_ingreso: number | null; // antigüedad de la unidad MÁS nueva en stock
  descuento: number;
};

export function clasificarSalud(p: SaludInput): SaludInfo {
  // Rota (tuvo ventas recientes)
  if (p.vendido_90d > 0) {
    if (p.descuento >= DESC_ALTO) {
      return {
        nivel: "fuga_margen",
        label: "Fuga de margen",
        dot: "bg-blue-500",
        accion: "Rota bien con descuento alto — evaluar quitar/bajar descuento",
        muerto: false,
      };
    }
    return { nivel: "sano", label: "Sano", dot: "bg-green-500", accion: "Rota con normalidad", muerto: false };
  }

  // Sin ventas recientes pero repuesto hace poco → darle tiempo, no es muerto
  if (p.dias_ultimo_ingreso != null && p.dias_ultimo_ingreso < DIAS_MUERTO) {
    return {
      nivel: "reciente",
      label: "Reciente",
      dot: "bg-gray-300",
      accion: "Ingreso reciente sin ventas aún — observar",
      muerto: false,
    };
  }

  // Sin ventas + stock antiguo → muerto. Severidad según descuento actual.
  if (p.descuento >= DESC_ALTO) {
    return {
      nivel: "muerto_desc_alto",
      label: "Muerto pese a descuento alto",
      dot: "bg-red-600",
      accion: "No responde al precio — liquidación / bundle / decisión manual",
      muerto: true,
    };
  }
  if (p.descuento > 0) {
    return {
      nivel: "muerto_con_desc",
      label: "Muerto con descuento",
      dot: "bg-orange-500",
      accion: "El descuento no basta — subir escalón",
      muerto: true,
    };
  }
  return {
    nivel: "muerto_sin_desc",
    label: "Muerto sin descuento",
    dot: "bg-amber-400",
    accion: "Candidato a primer descuento",
    muerto: true,
  };
}
