import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { IMAGENES_BASE, ORIGEN_IMAGENES, requireMarketing } from "@/lib/marketing";
import { fijasGestion } from "@/lib/marketing-catalogos-datos";
import { tiposCatalogo } from "@/lib/marketing-tipos";
import { GestorTipos } from "@/components/admin/marketing/gestor-tipos";
import { preconnect } from "react-dom";
import { opcionesDeFiltros } from "@/lib/marketing-opciones";

/** Tipos de catálogo: los de fábrica y los personalizados; crear, editar, activar, borrar y asociar la portada de cada uno. */
export default async function TiposPage() {
  await requireMarketing();
  preconnect(ORIGEN_IMAGENES);
  const [tipos, fijas, opciones] = await Promise.all([
    tiposCatalogo(),
    fijasGestion(),
    opcionesDeFiltros(),
  ]);

  return (
    <div className="p-4 md:p-8">
      <Link href="/admin/marketing/catalogos" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" /> Catálogos
      </Link>
      <h1 className="mb-4 text-xl font-semibold text-foreground">Tipos de catálogo</h1>
      <GestorTipos
        base={IMAGENES_BASE}
        tipos={tipos}
        portadas={fijas.filter((f) => f.tipo === "portada")}
        opciones={opciones}
      />
    </div>
  );
}
