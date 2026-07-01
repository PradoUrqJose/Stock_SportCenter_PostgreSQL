import { getSession, isAdminRole } from "@/lib/auth";
import { db, toPlain } from "@/lib/db";
import { zipSync, strToU8 } from "fflate";

type LineaRow = { descuento_nuevo: number; cod_universal: string };
type LoteRow = { id: number; estado: string };

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !isAdminRole(session.rol)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const loteId = parseInt(id, 10);
  if (isNaN(loteId)) return new Response("Bad Request", { status: 400 });

  const loteResult = await db.execute({
    sql: `SELECT id, estado FROM lotes WHERE id = ?`,
    args: [loteId],
  });
  if (!loteResult.rows.length) return new Response("Not Found", { status: 404 });

  const lote = toPlain<LoteRow>(loteResult.rows)[0];
  if (lote.estado === "borrador") {
    return new Response("El lote debe estar publicado o cerrado para exportar.", {
      status: 400,
    });
  }

  const lineasResult = await db.execute({
    sql: `SELECT descuento_nuevo, cod_universal FROM lote_lineas WHERE lote_id = ? ORDER BY cod_universal`,
    args: [loteId],
  });
  const lineas = toPlain<LineaRow>(lineasResult.rows);

  // Group cod_universal by integer discount level
  const groups = new Map<number, string[]>();
  for (const l of lineas) {
    const pct = Math.round(l.descuento_nuevo);
    if (!groups.has(pct)) groups.set(pct, []);
    groups.get(pct)!.push(l.cod_universal);
  }

  // Build ZIP: one .txt file per discount level, named e.g. "30.txt"
  const files: Record<string, Uint8Array> = {};
  for (const [pct, codes] of groups) {
    files[`${pct}.txt`] = strToU8(codes.join("\n"));
  }

  const zipped = zipSync(files);

  return new Response(zipped, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="lote-${loteId}.zip"`,
    },
  });
}
