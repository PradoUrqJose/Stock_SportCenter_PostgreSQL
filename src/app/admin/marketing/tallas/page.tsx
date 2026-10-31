import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { marcasDeMarketing } from "@/lib/marketing-opciones";
import { requireMarketing } from "@/lib/marketing";
import { GestorTallas } from "@/components/admin/marketing/gestor-tallas";
import { equivalenciasFaltantes, tablasDeTallas } from "@/lib/marketing-tallas-datos";
import { indexarTallas } from "@/lib/marketing-tallas";

/** Equivalencia entre la talla USA del ERP y la talla peruana, por marca y género. */
export default async function TallasPage() {
  await requireMarketing();
  const [tablas, marcasLocales] = await Promise.all([
    tablasDeTallas(),
    marcasDeMarketing(),
  ]);
  const faltantes = await equivalenciasFaltantes(indexarTallas(tablas));
  const marcas = marcasLocales.sort();

  return (
    <div className="p-4 md:p-8">
      <Link href="/admin/marketing" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" /> Marketing
      </Link>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Tallas</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Equivalencia entre la talla USA que entrega el ERP y la talla peruana, por marca y género. Los catálogos nuevos salen por defecto con la talla peruana; las marcas
          y géneros sin equivalencia salen con talla USA y se avisa.
        </p>
      </div>
      <GestorTallas tablas={tablas} faltantes={faltantes} marcas={marcas} />
    </div>
  );
}
