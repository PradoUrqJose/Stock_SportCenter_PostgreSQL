"use server";

import { sesionMarketing } from "@/lib/marketing";
import { codigoValido, normalizarCodigo } from "@/lib/marketing-codigos";
import { inventarioImagenesVigente } from "@/lib/marketing-inventario-imagenes";
import { versionImagenDisponible } from "@/lib/marketing-inventario-imagenes-control";
import type { ActionResult } from "@/types";

const MAX_CODIGOS = 1000;

/** De los códigos recibidos, devuelve los que ya tienen imagen registrada. */
export async function consultarCodigosExistentes(codigos: string[]): Promise<ActionResult<string[]>> {
  if (!(await sesionMarketing())) return { success: false, msg: "Sin permisos" };
  if (codigos.length > MAX_CODIGOS) return { success: false, msg: `Máximo ${MAX_CODIGOS} códigos por consulta` };

  const validos = [...new Set(codigos.map(normalizarCodigo).filter(codigoValido))];
  if (validos.length === 0) return { success: true, msg: "", data: [] };

  try {
    const { versiones } = await inventarioImagenesVigente();
    return { success: true, msg: "", data: validos.filter((c) => versionImagenDisponible(c, versiones) !== 0) };
  } catch {
    return { success: false, msg: "No se pudo comprobar R2. Vuelve a intentarlo antes de subir imágenes." };
  }
}
