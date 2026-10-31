import { db } from "@/lib/db";
import { r2ListarOriginales } from "@/lib/r2";
import { codigoValido } from "@/lib/marketing-codigos";
import { codigosImagenesR2 } from "@/lib/marketing-imagenes-pendientes";
import { reconciliarIndiceImagenes } from "@/lib/marketing-inventario-imagenes-control";
import { urlPublicaOriginal } from "@/lib/marketing";

/** Sin caché entre consultas: también reconoce cargas realizadas fuera de STOCK. */
export async function inventarioImagenesVigente() {
  const codigos = codigosImagenesR2(await r2ListarOriginales()).filter(codigoValido);
  const resultado = await reconciliarIndiceImagenes(codigos, {
    leer: async (lista) => {
      const r = await db.execute({
        sql: "SELECT cod_universal, version FROM mk_imagenes WHERE cod_universal = ANY(?)",
        args: [lista],
      });
      return r.rows.map((f) => ({ codigo: f.cod_universal as string, version: f.version as number }));
    },
    registrar: async (lista) => {
      // Concurrencia: conserva cualquier versión que una subida haya creado entretanto.
      const r = await db.execute({
        sql: `INSERT INTO mk_imagenes (cod_universal, imagen_url)
              SELECT * FROM unnest(?::text[], ?::text[])
              ON CONFLICT (cod_universal) DO UPDATE SET
                version = GREATEST(mk_imagenes.version, 1),
                imagen_url = COALESCE(mk_imagenes.imagen_url, excluded.imagen_url)
              RETURNING cod_universal, version`,
        args: [lista, lista.map(urlPublicaOriginal)],
      });
      return r.rows.map((f) => ({ codigo: f.cod_universal as string, version: f.version as number }));
    },
  });
  return { ...resultado, verificadoAl: new Date().toISOString() };
}
