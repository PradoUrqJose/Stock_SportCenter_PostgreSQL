"use server";

import { db } from "@/lib/db";
import { sesionMarketing } from "@/lib/marketing";
import { codigoValido, normalizarCodigo } from "@/lib/marketing-codigos";
import type { ActionResult } from "@/types";

const MAX_CODIGOS = 1000;

/** De los códigos recibidos, devuelve los que ya tienen imagen registrada. */
export async function consultarCodigosExistentes(codigos: string[]): Promise<ActionResult<string[]>> {
  if (!(await sesionMarketing())) return { success: false, msg: "Sin permisos" };
  if (codigos.length > MAX_CODIGOS) return { success: false, msg: `Máximo ${MAX_CODIGOS} códigos por consulta` };

  const validos = [...new Set(codigos.map(normalizarCodigo).filter(codigoValido))];
  if (validos.length === 0) return { success: true, msg: "", data: [] };

  const r = await db.execute({
    sql: "SELECT cod_universal FROM mk_imagenes WHERE cod_universal = ANY(?)",
    args: [validos],
  });
  return { success: true, msg: "", data: r.rows.map((x) => x.cod_universal as string) };
}
