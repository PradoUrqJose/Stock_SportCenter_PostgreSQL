"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import type { ActionResult } from "@/types";

export async function guardarImagenProducto(
  cod_universal: string,
  imagen_url: string
): Promise<ActionResult> {
  try {
    await requireRole("admin", "administrador_general");

    const url = imagen_url.trim();

    if (!url) {
      await db.execute({
        sql: `DELETE FROM producto_imagenes WHERE cod_universal = ?`,
        args: [cod_universal],
      });
      revalidatePath("/admin/actualizacion");
      return { success: true, msg: "Imagen eliminada" };
    }

    if (!/^https?:\/\//i.test(url)) {
      return { success: false, msg: "La URL debe comenzar con http:// o https://" };
    }

    // Manual edits always win over the ERP file import (source='sistema'),
    // and survive the next stock upload since initUpload() only wipes source='archivo'.
    await db.execute({
      sql: `INSERT INTO producto_imagenes (cod_universal, imagen_url, source)
            VALUES (?, ?, 'sistema')
            ON CONFLICT (cod_universal)
            DO UPDATE SET imagen_url = excluded.imagen_url, source = 'sistema', updated_at = now_text()`,
      args: [cod_universal, url],
    });

    revalidatePath("/admin/actualizacion");
    return { success: true, msg: "Imagen guardada" };
  } catch (e) {
    return { success: false, msg: String(e) };
  }
}
