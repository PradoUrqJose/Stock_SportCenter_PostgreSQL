export type DiscountLevel = 10 | 20 | 30 | 40 | 50 | 60 | 70;

export type DiscountColor = {
  hex: string;
  tailwind: string;
  excel: string;
  text: "white" | "black";
};

export const DISCOUNT_COLORS: Record<DiscountLevel, DiscountColor> = {
  10: { hex: "#06b050", tailwind: "bg-[#06b050]", excel: "FF06B050", text: "white" },
  20: { hex: "#feff00", tailwind: "bg-[#feff00]", excel: "FFFEFF00", text: "black" },
  30: { hex: "#ffbf00", tailwind: "bg-[#ffbf00]", excel: "FFFFBF00", text: "black" },
  40: { hex: "#ff0000", tailwind: "bg-[#ff0000]", excel: "FFFF0000", text: "white" },
  50: { hex: "#7031a0", tailwind: "bg-[#7031a0]", excel: "FF7031A0", text: "white" },
  60: { hex: "#c75912", tailwind: "bg-[#c75912]", excel: "FFC75912", text: "white" },
  70: { hex: "#404040", tailwind: "bg-[#404040]", excel: "FF404040", text: "white" },
};

/** Only exact matches (10, 20, ..., 70) have a defined color; anything else returns null. */
export function getDiscountColor(descuento: number): DiscountColor | null {
  return DISCOUNT_COLORS[descuento as DiscountLevel] ?? null;
}
