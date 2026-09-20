// Ajuste de textos a su zona: lo comparten el visor (pantalla) y el PDF, para que el texto
// caiga en el mismo lugar y con el mismo tamaño en los dos. Solo lógica pura: la medida real
// del texto la pone quien llama (canvas en pantalla, jsPDF en el PDF), ambos con Montserrat Black.
import type { Zona } from "./marketing-catalogo";

/** Ancho, en px de diseño, que ocupa `texto` a `px` de tamaño. */
export type Medir = (texto: string, px: number) => number;

export type TextoAjustado = { px: number; lineas: string[] };

/** Alto de línea, como múltiplo del tamaño de letra (el mismo `leading` del visor). */
export const ALTO_LINEA = 1.12;

// Devuelve el tamaño más grande (≤ zona.max) en que el texto entra en la zona,
// partiéndolo en líneas por los separadores cuando hace falta.
export function ajustar(partes: string[], zona: Zona, sep: string, medir: Medir): TextoAjustado {
  for (let px = zona.max ?? 40; px >= 14; px -= 2) {
    const lineas: string[] = [];
    let actual = "";
    for (const p of partes) {
      const prueba = actual ? actual + sep + p : p;
      if (medir(prueba, px) <= zona.w || !actual) actual = prueba;
      else {
        lineas.push(actual);
        actual = p;
      }
    }
    if (actual) lineas.push(actual);
    if (lineas.every((l) => medir(l, px) <= zona.w) && lineas.length * px * ALTO_LINEA <= zona.h) return { px, lineas };
  }
  return { px: 14, lineas: [partes.join(sep)] };
}
