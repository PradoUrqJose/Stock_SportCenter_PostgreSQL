"use client";

// Botón «PDF» del visor público y del editor. La ventana con las opciones (y jsPDF) se descarga
// solo al pulsarlo, así la página de los clientes no pesa más para quien no pide el PDF.
import { useState } from "react";
import dynamic from "next/dynamic";
import { Download } from "lucide-react";
import type { EntradaPdf } from "@/lib/marketing-pdf";
import { cn } from "@/lib/utils";

const PanelPdf = dynamic(() => import("./panel-pdf"), { ssr: false });

export function BotonPdf({ entrada, className }: { entrada: EntradaPdf; className?: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        disabled={entrada.paginas.length === 0}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#2a2d35] bg-transparent px-2.5 text-sm font-medium text-[#e8e8e8] transition-colors hover:bg-white/5 disabled:opacity-50",
          className
        )}
      >
        <Download className="size-4" /> PDF
      </button>
      {abierto && <PanelPdf entrada={entrada} alCerrar={() => setAbierto(false)} />}
    </>
  );
}
