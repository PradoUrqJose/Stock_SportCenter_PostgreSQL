import Link from "next/link";
import { Montserrat } from "next/font/google";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { IMAGENES_BASE, ORIGEN_IMAGENES, requireMarketing } from "@/lib/marketing";
import { enlacesDeContacto, fijasGestion, plantillasGestion } from "@/lib/marketing-catalogos-datos";
import { tiposCatalogo } from "@/lib/marketing-tipos";
import { BibliotecaDisenos } from "@/components/admin/marketing/biblioteca-disenos";
import { preconnect } from "react-dom";

// Tipografía del diseño (la misma del catálogo): el editor de posiciones del texto la usa para mostrar el ejemplo real.
const montserrat = Montserrat({ subsets: ["latin"], weight: "900", display: "swap" });

/** Diseños de Marketing (plantillas por marca, portadas, separadores, cierres): ver, activar y subir. */
export default async function DisenosPage() {
  await requireMarketing();
  preconnect(ORIGEN_IMAGENES);
  const [plantillas, fijas, enlaces, marcas, tipos] = await Promise.all([
    plantillasGestion(),
    fijasGestion(),
    enlacesDeContacto(),
    db.execute("SELECT marca FROM productos WHERE marca IS NOT NULL GROUP BY 1 ORDER BY COUNT(*) DESC, 1"),
    tiposCatalogo(),
  ]);

  return (
    <div className="p-4 md:p-8">
      <Link href="/admin/marketing/catalogos" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" /> Catálogos
      </Link>
      <h1 className="mb-4 text-xl font-semibold text-foreground">Diseños</h1>
      <BibliotecaDisenos base={IMAGENES_BASE} plantillas={plantillas} fijas={fijas} marcas={marcas.rows.map((r) => r.marca as string)} enlaces={enlaces} fuente={montserrat.style.fontFamily} tipos={tipos.map((t) => ({ id: t.id, nombre: t.nombre }))} />
    </div>
  );
}
