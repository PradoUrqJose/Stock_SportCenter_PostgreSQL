// Lee en el NAVEGADOR el Excel (o CSV) de equivalencias de tallas y lo deja como filas para validar en el servidor.
// Formato: una fila por talla con las columnas MARCA | GENERO | PERU | USA | PIE_CM (ver la plantilla descargable).
import * as XLSX from "xlsx";
import type { FilaEntrada } from "@/lib/marketing-tallas";

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

const ALIAS: Record<"marca" | "genero" | "peru" | "usa" | "pie_cm", string[]> = {
  marca: ["MARCA"],
  genero: ["GENERO", "GENEROS"],
  peru: ["PERU", "TALLAPERU", "PERUANA", "TALLAPERUANA"],
  usa: ["USA", "TALLAUSA", "EEUU"],
  pie_cm: ["PIECM", "PIE", "LARGOPIE", "LARGODELPIE", "CM"],
};

export async function leerArchivoTallas(archivo: File): Promise<FilaEntrada[]> {
  return filasDeLibro(XLSX.read(await archivo.arrayBuffer(), { type: "array" }));
}

/** Las filas de un libro ya leído (separado para poder probarlo sin un archivo del navegador). */
export function filasDeLibro(libro: XLSX.WorkBook): FilaEntrada[] {
  const nombre = libro.SheetNames.find((n) => norm(n) === "EQUIVALENCIAS") ?? libro.SheetNames[0];
  if (!nombre) throw new Error("El archivo no tiene hojas.");
  const filas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[nombre], { header: 1, raw: true, defval: null, blankrows: true });

  // La fila de encabezados: la primera que trae MARCA y USA.
  const iEnc = filas.findIndex((f) => f.some((c) => ALIAS.marca.includes(norm(c))) && f.some((c) => ALIAS.usa.includes(norm(c))));
  if (iEnc === -1) throw new Error("No encontré los encabezados. La primera fila debe decir MARCA, GENERO, PERU, USA y PIE_CM (descarga la plantilla).");
  const col = (campo: keyof typeof ALIAS) => filas[iEnc].findIndex((c) => ALIAS[campo].includes(norm(c)));
  const idx = { marca: col("marca"), genero: col("genero"), peru: col("peru"), usa: col("usa"), pie_cm: col("pie_cm") };
  const faltan = (["marca", "genero", "peru", "usa"] as const).filter((k) => idx[k] === -1);
  if (faltan.length > 0) throw new Error(`Falta la columna ${faltan.map((k) => k.toUpperCase()).join(", ")}. Usa la plantilla descargable.`);

  const vacio = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
  return filas
    .slice(iEnc + 1)
    .map((f, i) => ({
      fila: iEnc + i + 2,
      marca: f[idx.marca],
      genero: f[idx.genero],
      peru: f[idx.peru],
      usa: f[idx.usa],
      pie_cm: idx.pie_cm === -1 ? null : f[idx.pie_cm],
    }))
    // La plantilla trae ~1.000 filas en blanco (con el desplegable de género): no viajan al servidor.
    .filter((f) => ![f.marca, f.genero, f.peru, f.usa, f.pie_cm].every(vacio));
}
