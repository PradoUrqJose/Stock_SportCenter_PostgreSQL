/** Valores de descuento que se muestran en la matriz de Comisiones. Este
 * módulo no accede a la BD y puede usarse tanto en cliente como en servidor. */
export const DESCUENTOS_COMISION = [10, 20, 30, 40, 50, 60, 70] as const;
export type DescuentoComision = typeof DESCUENTOS_COMISION[number];

export const ESTILO_ENCABEZADO_PROMOCION: Record<DescuentoComision, { web: string; excel: string; textoExcel: string }> = {
  10: { web: "bg-[#00B050] text-black hover:bg-[#00B050]", excel: "FF00B050", textoExcel: "FF000000" },
  20: { web: "bg-[#FFFF00] text-black hover:bg-[#FFFF00]", excel: "FFFFFF00", textoExcel: "FF000000" },
  30: { web: "bg-[#FFC000] text-black hover:bg-[#FFC000]", excel: "FFFFC000", textoExcel: "FF000000" },
  40: { web: "bg-[#FF0000] text-white hover:bg-[#FF0000]", excel: "FFFF0000", textoExcel: "FFFFFFFF" },
  50: { web: "bg-[#7030A0] text-white hover:bg-[#7030A0]", excel: "FF7030A0", textoExcel: "FFFFFFFF" },
  60: { web: "bg-[#9E480E] text-white hover:bg-[#9E480E]", excel: "FF9E480E", textoExcel: "FFFFFFFF" },
  70: { web: "bg-[#666666] text-white hover:bg-[#666666]", excel: "FF666666", textoExcel: "FFFFFFFF" },
};

export const ENCABEZADO_OSCURO = { web: "bg-[#1C1C1C] text-white hover:bg-[#1C1C1C]", excel: "FF1C1C1C", textoExcel: "FFFFFFFF" };
