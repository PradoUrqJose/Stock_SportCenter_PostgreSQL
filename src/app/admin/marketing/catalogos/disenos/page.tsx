import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { IMAGENES_BASE, ORIGEN_IMAGENES, requireMarketing } from "@/lib/marketing";
import { fijasGestion, plantillasGestion } from "@/lib/marketing-catalogos-datos";
import { BibliotecaDisenos } from "@/components/admin/marketing/biblioteca-disenos";
import { preconnect } from "react-dom";

/** Diseños de Marketing (plantillas por marca, portadas, separadores, cierres): ver, activar y subir. */
export default async function DisenosPage() {
  await requireMarketing();
  preconnect(ORIGEN_IMAGENES);
  const [plantillas, fijas, marcas] = await Promise.all([
    plantillasGestion(),
    fijasGestion(),
    db.execute("SELECT marca FROM productos WHERE marca IS NOT NULL GROUP BY 1 ORDER BY COUNT(*) DESC, 1"),
  ]);

  return (
    <div className="p-4 md:p-8">
      <Link href="/admin/marketing/catalogos" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" /> Catálogos
      </Link>
      <h1 className="mb-4 text-xl font-semibold text-foreground">Diseños</h1>
      <BibliotecaDisenos base={IMAGENES_BASE} plantillas={plantillas} fijas={fijas} marcas={marcas.rows.map((r) => r.marca as string)} />
    </div>
  );
}
