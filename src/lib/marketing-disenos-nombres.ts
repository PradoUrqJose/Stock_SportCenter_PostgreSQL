// Clasifica un diseño por el NOMBRE de su archivo (lógica pura, sin BD ni red), para la subida masiva:
//   PLANTILLA NIKE.jpg               → plantilla de zapatilla de Nike
//   PLANTILLA NIKE NAVIDAD FINAL.jpg → otra plantilla de Nike, «Nike Navidad»
//   PLANTILLA GENERICA.jpg           → plantilla genérica (sin marca)
//   PORTADA CATALOGO HOMBRES.jpg     → portada del tipo «Hombres» (también MUJERES, NIÑOS, ROPA HOMBRE, ROPA MUJER,
//                                      ROPA, SANDALIAS, ACCESORIOS, FUTBOL)
//   SEPARADOR FUTBOL LOSA.jpg        → separador de fútbol (opcional; se ubica en el editor)
//   SEPARADOR MARCA ADIDAS.jpg       → separador de la marca Adidas (uno por marca; también «SEPARADOR ADIDAS» si Adidas es una marca conocida)
//   TERMINOS Y CONDICIONES.jpg / REDES.jpg / CIERRE… → cierre, al final de todos los catálogos
// Lo que no encaje queda como «otra» a mano. Todo se puede corregir en la tabla antes de subir.
import { MARCA_GENERICA, type FijaBiblioteca } from "./marketing-catalogo";

export type DisenoInterpretado = {
  clase: "plantilla" | "fija";
  /** Plantilla: marca en mayúsculas, o «*» si es genérica. */
  marca: string;
  /** Página fija: su tipo. */
  tipo: FijaBiblioteca["tipo"];
  nombre: string;
  /** Tipos de catálogo en los que se usa (`hombre`, `ropa-mujer`, `futbol`…), `["*"]` (todos) o vacío (a mano). */
  aplica: string[];
  posicion: "inicio" | "final" | "";
};

const RUIDO = new Set(["FINAL", "ULTIMO", "CATALOGO", "COPIA", "NUEVO", "NUEVA", "V1", "V2", "V3"]);
const MINUSCULAS = new Set(["y", "de", "del", "la", "el", "los", "las", "en", "con", "para"]);
const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

function titulo(palabras: string[]): string {
  return palabras
    .map((p, i) => {
      const b = p.toLowerCase();
      return i > 0 && MINUSCULAS.has(b) ? b : b.charAt(0).toUpperCase() + b.slice(1);
    })
    .join(" ");
}

/** @param marcasConocidas marcas que existen en el sistema (para reconocer las de varias palabras, como «Under Armour») */
export function interpretarNombreDiseno(archivo: string, marcasConocidas: readonly string[] = []): DisenoInterpretado {
  const base = archivo.replace(/(\.(jpe?g|png|webp))+$/i, "").replace(/[_\-.]+/g, " ").trim();
  const originales = base.split(/\s+/).filter(Boolean);
  const norm = originales.map(sinTildes);
  // Palabras útiles: sin ruido ("FINAL", "ULTIMO", "CATALOGO"…).
  const idx = norm.map((_, i) => i).filter((i) => !RUIDO.has(norm[i]));
  const n = idx.map((i) => norm[i]);
  const o = idx.map((i) => originales[i]);
  const primera = n[0] ?? "";
  const resto = (desde: number) => o.slice(desde);

  const fija = (tipo: FijaBiblioteca["tipo"], nombre: string, aplica: string[], posicion: DisenoInterpretado["posicion"], marca = ""): DisenoInterpretado => ({
    clase: "fija",
    marca,
    tipo,
    nombre: nombre || titulo(o) || "Sin nombre",
    aplica,
    posicion,
  });

  if (primera === "PLANTILLA" || primera === "PLANTILLAS") {
    const r = n.slice(1);
    const ro = resto(1);
    const generica = r[0] === "GENERICA" || r[0] === "GENERICO" || r[0] === "GENERAL" || (r[0] === "SIN" && r[1] === "MARCA");
    if (generica) return { clase: "plantilla", marca: MARCA_GENERICA, tipo: "portada", nombre: titulo(ro.length > 1 ? ro : ["Genérica"]), aplica: [], posicion: "" };
    // Marca: la más larga de las conocidas con la que empieza el resto; si no, la primera palabra.
    const conocida = [...marcasConocidas].map((m) => ({ m, k: sinTildes(m).split(/\s+/) })).sort((a, b) => b.k.length - a.k.length).find(({ k }) => k.every((w, i) => r[i] === w));
    const largo = conocida ? conocida.k.length : 1;
    const marca = (conocida ? conocida.m : (r[0] ?? "")).toUpperCase();
    const nombre = titulo(ro.length > 0 ? ro : [marca]);
    return { clase: "plantilla", marca, tipo: "portada", nombre: largo === ro.length ? titulo(ro) : nombre, aplica: [], posicion: "" };
  }

  const contiene = (...ps: string[]) => ps.some((p) => n.includes(p));
  if (primera === "PORTADA" || primera === "PORTADAS") {
    const nombre = titulo(o);
    // Cada portada es la de un tipo de catálogo; «ROPA HOMBRE» y «ROPA MUJER» antes que «HOMBRE» y «MUJER».
    const tipo = contiene("FUTBOL")
      ? "futbol"
      : contiene("ROPA") && contiene("HOMBRE", "HOMBRES")
        ? "ropa-hombre"
        : contiene("ROPA") && contiene("MUJER", "MUJERES")
          ? "ropa-mujer"
          : contiene("ROPA")
            ? "ropa"
            : contiene("SANDALIAS")
              ? "sandalias"
              : contiene("ACCESORIOS")
                ? "accesorios"
                : contiene("HOMBRE", "HOMBRES")
                  ? "hombre"
                  : contiene("MUJER", "MUJERES")
                    ? "mujer"
                    : contiene("NINO", "NINOS", "NINAS")
                      ? "ninos"
                      : "";
    return fija("portada", nombre, tipo ? [tipo] : [], tipo ? "inicio" : "");
  }
  if (primera === "SEPARADOR" || primera === "SEPARADORES") {
    // De marca: «SEPARADOR MARCA ADIDAS» o «SEPARADOR ADIDAS» (si Adidas es una marca conocida); la más larga gana.
    const r = n.slice(n[1] === "MARCA" ? 2 : 1);
    const conocida = [...marcasConocidas].map((m) => ({ m, k: sinTildes(m).split(/\s+/) })).sort((a, b) => b.k.length - a.k.length).find(({ k }) => r.length >= k.length && k.every((w, i) => r[i] === w));
    if (conocida) return fija("separador_marca", `Separador ${titulo(conocida.m.split(/\s+/))}`, [], "", conocida.m.toUpperCase());
    if (n[1] === "MARCA" && r.length > 0) return fija("separador_marca", `Separador ${titulo(r.map((w) => w.toLowerCase()))}`, [], "", r.join(" "));
    return fija("separador", titulo(o), contiene("FUTBOL") ? ["futbol"] : [], "");
  }
  if (contiene("TERMINOS", "CONDICIONES", "REDES", "CIERRE", "CONTACTO")) {
    return fija("cierre", titulo(o), ["*"], "final");
  }
  return fija("otra", titulo(o), [], "");
}

/**
 * Identidad de un diseño por su nombre: sin tildes, mayúsculas, símbolos ni la palabra inicial «Separador», «Portada»
 * o «Plantilla». Dos nombres con la misma clave son el mismo diseño («Términos y condiciones» = «Terminos y Condiciones»).
 */
export function claveNombre(nombre: string): string {
  const palabras = sinTildes(nombre).replace(/[^A-Z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  if (palabras.length > 1 && ["SEPARADOR", "PORTADA", "PLANTILLA"].includes(palabras[0])) palabras.shift();
  return palabras.join(" ").toLowerCase();
}
